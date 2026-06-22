import os
import shutil
import tempfile
from typing                         import List
from fastapi                        import APIRouter, UploadFile, File, HTTPException, Depends, Request
from fastapi.responses              import FileResponse
from app.config                     import settings
from app.models.all_models          import User
from app.services.auth_service      import get_current_user, get_current_admin_user
from app.services.rag_pipeline      import delete_document, delete_all_documents
from app.services.task_service      import TaskTrackerService, get_task_service
from app.services.rate_limit        import RateLimit, RateLimiter, get_rate_limiter
from app.services.upload_validation import (
    POLICY,
    stream_upload,
    validate_file_signature,
    validate_upload_metadata,
)


router = APIRouter(prefix="/documents", tags=["Documents & RAG"])


@router.get("/", status_code=200)
def list_documents(
    skip: int = 0,
    limit: int = 10,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    List all documents currently stored on disk with pagination.
    """
    DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
    data_dir = settings.DATA_DIR
    if not os.path.exists(data_dir):
        return {"documents": [], "total": 0}
    files = []
    for fname in os.listdir(data_dir):
        fpath = os.path.join(data_dir, fname)
        ext = os.path.splitext(fname)[1].lower()
        if os.path.isfile(fpath) and ext in DOCUMENT_EXTENSIONS:
            files.append({"filename": fname, "size_bytes": os.path.getsize(fpath)})
    files.sort(key=lambda f: f["filename"])
    total = len(files)
    paginated_files = files[skip : skip + limit]
    return {"documents": paginated_files, "total": total}


@router.post("/ingest", status_code=202)
def ingest_endpoint(
    files: List[UploadFile] = File(...),
    current_admin: User = Depends(get_current_admin_user),
    task_service: TaskTrackerService = Depends(get_task_service),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
):
    """
    Upload legal documents, stage them, and queue the ingestion pipeline in the background.

    Args:
        files (List[UploadFile]): A list of uploaded files to process.
        chat_engine (ContextChatEngine): The global AI chat engine dependency.

    Returns:
        dict: A status dictionary containing the number of queued files.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > POLICY.max_files:
        raise HTTPException(
            status_code=413,
            detail=f"Maximum {POLICY.max_files} files per upload",
        )

    rate_limiter.enforce(
        "upload:admin",
        str(current_admin.id),
        RateLimit(settings.RATE_LIMIT_UPLOAD_ADMIN_PER_10_MINUTES, 600),
    )
        
    staging_dir = None
    background_scheduled = False
    try:
        # Ensure data directory exists
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        
        saved_files = []
        staging_dir = tempfile.mkdtemp(dir=settings.DATA_DIR)
        seen_filenames = set()
        total_bytes = 0
        for file in files:
            safe_filename, extension = validate_upload_metadata(file)
            normalized_filename = safe_filename.casefold()
            if normalized_filename in seen_filenames:
                raise HTTPException(
                    status_code=400,
                    detail=f"Duplicate filename: {safe_filename}",
                )
            seen_filenames.add(normalized_filename)

            staged_path = os.path.join(staging_dir, safe_filename)
            with open(staged_path, "wb") as buffer:
                file_bytes, first_bytes = stream_upload(file, buffer, total_bytes)
            validate_file_signature(staged_path, extension, first_bytes)
            total_bytes += file_bytes
            saved_files.append(safe_filename)
            file.file.close()

        task_id = task_service.enqueue_upload(
            staging_dir,
            saved_files,
            settings.DATA_DIR,
        )
        background_scheduled = True
        
        return {
            "status": "queued",
            "task_id": task_id,
            "message": f"Queued {len(saved_files)} files for background ingestion.",
            "files": saved_files
        }
    except HTTPException:
        raise
    except Exception as e:
        from app.logger import get_logger
        get_logger(__name__).error(f"Ingest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to stage uploaded files") from e
    finally:
        for file in files:
            try:
                file.file.close()
            except Exception:
                pass
        if staging_dir and not background_scheduled:
            shutil.rmtree(staging_dir, ignore_errors=True)


# Manual synchronization and document deletion
@router.post("/sync", status_code=202)
def sync_endpoint(
    current_admin: User = Depends(get_current_admin_user),
    task_service: TaskTrackerService = Depends(get_task_service),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
):
    """
    Queue synchronization of the vector database with all existing documents in the DATA_DIR.
    This is useful for manually placed files.

    Returns:
        dict: A status message detailing the sync result.
    """
    rate_limiter.enforce(
        "upload:admin",
        str(current_admin.id),
        RateLimit(settings.RATE_LIMIT_UPLOAD_ADMIN_PER_10_MINUTES, 600),
    )

    try:
        # Ensure data directory exists
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        
        # Get list of existing files
        existing_files = [
            filename
            for filename in os.listdir(settings.DATA_DIR)
            if os.path.isfile(os.path.join(settings.DATA_DIR, filename))
            and os.path.splitext(filename)[1].lower() in {".pdf", ".docx", ".txt"}
        ]
        if not existing_files:
            return {
                "status": "info",
                "message": "No files found in the data directory to sync."
            }
            
        # Run the RAG ingestion pipeline (sync all) in background
        task_id = task_service.enqueue_sync(settings.DATA_DIR, len(existing_files))
        
        return {
            "status": "queued",
            "task_id": task_id,
            "message": f"Queued {len(existing_files)} existing files for background synchronization."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to enqueue synchronization") from e


# Polling endpoint for tasks
@router.get("/tasks/{task_id}")
def get_task_status(
    task_id: str,
    task_service: TaskTrackerService = Depends(get_task_service),
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Check the status of a background task.
    """
    task = task_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    
    return task


# Bulk document deletion
from pydantic import BaseModel as PydanticBaseModel
class PasswordVerify(PydanticBaseModel):
    password: str

@router.delete("/all", status_code=200)
def delete_all_documents_endpoint(
    payload: PasswordVerify,
    request: Request,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Delete ALL documents and their vectors. Requires password re-verification.
    """
    from app.services.auth_service import verify_password
    if not verify_password(payload.password, current_admin.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect password"
        )
    try:
        result = delete_all_documents()
        request.app.state.retriever = None
        request.app.state.index = None
        return {
            "status": "success",
            "message": f"Deleted {result['deleted_files']} file(s) and {result['nodes_deleted_from_docstore']} node(s).",
            "details": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Document deletion
@router.get("/{filename}/preview")
def preview_document(
    filename: str,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Get raw text preview of a document.
    """
    file_path = os.path.join(settings.DATA_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".txt":
        with open(file_path, "r", encoding="utf-8") as f:
            return {"text": f.read()}
            
    from llama_index.core import SimpleDirectoryReader
    from app.services.smart_pdf_reader import SmartPDFReader
    
    file_extractor = {".pdf": SmartPDFReader()} if ext == ".pdf" else None
    documents = SimpleDirectoryReader(
        input_files=[file_path],
        file_extractor=file_extractor
    ).load_data()
    
    text = "\n\n".join([doc.text for doc in documents])
    return {"text": text}


@router.get("/{filename}/chunks")
def get_document_chunks(
    filename: str,
    skip: int = 0,
    limit: int = 100,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Get indexed chunks for a document.
    """
    from llama_index.core.storage.docstore import SimpleDocumentStore
    
    docstore_path = settings.DOCSTORE_PATH
    if not os.path.exists(docstore_path):
        return {"total": 0, "chunks": []}
        
    docstore = SimpleDocumentStore.from_persist_path(docstore_path)
    
    chunks = []
    for doc_id, doc in docstore.docs.items():
        if doc.metadata.get("file_name") == filename:
            chunks.append({
                "id": doc_id,
                "text": doc.text,
                "metadata": doc.metadata
            })
            
    total = len(chunks)
    paginated = chunks[skip : skip + limit]
    return {
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "page_size": limit,
        "chunks": paginated
    }


class UpdateChunkRequest(PydanticBaseModel):
    text: str

@router.put("/chunks/{chunk_id}")
def update_chunk(
    chunk_id: str,
    req: UpdateChunkRequest,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Update a chunk's text and re-embed in the vector store.
    """
    from llama_index.core.storage.docstore import SimpleDocumentStore
    from app.db.qdrant_store import init_qdrant_vector_store
    from llama_index.core import Settings
    
    docstore_path = settings.DOCSTORE_PATH
    if not os.path.exists(docstore_path):
        raise HTTPException(status_code=404, detail="Docstore not found")
        
    docstore = SimpleDocumentStore.from_persist_path(docstore_path)
    if chunk_id not in docstore.docs:
        raise HTTPException(status_code=404, detail="Chunk not found")
        
    node = docstore.docs[chunk_id]
    node.set_content(req.text)
    
    # Persist in docstore
    docstore.persist(docstore_path)
    
    # Re-embed and upsert to Qdrant
    embed_model = Settings.embed_model
    if embed_model:
        node.embedding = embed_model.get_text_embedding(req.text)
    
    vector_store = init_qdrant_vector_store()
    vector_store.add([node])
    
    return {"status": "success", "chunk_id": chunk_id}

@router.delete("/{filename}")
def delete_document_endpoint(
    filename: str,
    request: Request,
    current_admin: User = Depends(get_current_admin_user)
):
    """
    Delete a document and its vectors from the system.

    Args:
        filename (str): The name of the file to delete.
        chat_engine (ContextChatEngine): The global AI chat engine dependency.

    Returns:
        dict: A status dictionary detailing the deletion results.
    """
    try:
        # Prevent Path Traversal
        filename = os.path.basename(filename)
        result = delete_document(filename)
        if not result["deleted_from_disk"] and result["nodes_deleted_from_docstore"] == 0:
            raise HTTPException(status_code=404, detail="Document not found")
            
        # Clear cached retriever and index
        request.app.state.retriever = None
        request.app.state.index = None
            
        return {
            "status": "success",
            "message": f"Successfully deleted '{filename}'",
            "details": result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file/{filename}", response_class=FileResponse)
def get_document_file(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve and stream an ingested document file, verified by authentication.

    Args:
        filename (str): The name of the file to retrieve.
        current_user (User): The authenticated user dependency.

    Returns:
        FileResponse: The streamed document file.
    """
    filename = os.path.basename(filename)
    file_path = os.path.join(settings.DATA_DIR, filename)

    data_dir = os.path.abspath(settings.DATA_DIR)
    if os.path.commonpath([data_dir, os.path.abspath(file_path)]) != data_dir:
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine the correct media type, defaulting to octet-stream
    media_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    
    return FileResponse(file_path, media_type=media_type, content_disposition_type="inline", filename=filename)

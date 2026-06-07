import os
import shutil
from typing                     import List
from fastapi                    import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses          import FileResponse
from llama_index.core.chat_engine import ContextChatEngine
from llama_index.core.storage.docstore import SimpleDocumentStore
from app.config                 import settings
from app.models.all_models      import User
from app.services.auth_service  import get_current_user
from app.services.rag_pipeline  import ingest_documents, delete_document
from app.services.chat_engine   import get_global_chat_engine


router = APIRouter(prefix="/documents", tags=["Documents & RAG"])


def _reload_global_chat_engine_docstore(chat_engine: ContextChatEngine):
    """
    Helper to reload the docstore in the global chat engine to avoid stale in-memory cache.
    """
    try:
        retriever = getattr(chat_engine, "_retriever", None)
        if retriever:
            storage_context = getattr(retriever, "_storage_context", None)
            if storage_context:
                if os.path.exists(settings.DOCSTORE_PATH):
                    storage_context.docstore = SimpleDocumentStore.from_persist_path(settings.DOCSTORE_PATH)
                    print("🚀 [AI Logic] Successfully reloaded docstore in global chat engine.")
    except Exception as e:
        print(f"⚠️ [AI Logic] Failed to reload docstore: {e}")


@router.post("/ingest")
def ingest_endpoint(
    files: List[UploadFile] = File(...),
    chat_engine: ContextChatEngine = Depends(get_global_chat_engine)
):
    """
    Upload legal documents, save them to DATA_DIR, and run the ingestion pipeline.

    Args:
        files (List[UploadFile]): A list of uploaded files to process.
        chat_engine (ContextChatEngine): The global AI chat engine dependency.

    Returns:
        dict: A status dictionary containing the number of ingested files.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
        
    try:
        # Ensure data directory exists
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        
        saved_files = []
        for file in files:
            file_path = os.path.join(settings.DATA_DIR, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_files.append(file.filename)
            
        # Run the RAG ingestion pipeline
        ingest_documents(data_path=settings.DATA_DIR)
        
        # Reload the docstore inside global chat engine
        _reload_global_chat_engine_docstore(chat_engine)
        
        return {
            "status": "success",
            "message": f"Successfully ingested {len(saved_files)} files.",
            "files": saved_files
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Manual synchronization and document deletion
@router.post("/sync")
def sync_endpoint(chat_engine: ContextChatEngine = Depends(get_global_chat_engine)):
    """
    Synchronize the vector database with all existing documents in the DATA_DIR.
    This is useful for manually placed files.

    Returns:
        dict: A status message detailing the sync result.
    """
    try:
        # Ensure data directory exists
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        
        # Get list of existing files
        existing_files = os.listdir(settings.DATA_DIR)
        if not existing_files:
            return {
                "status": "info",
                "message": "No files found in the data directory to sync."
            }
            
        # Run the RAG ingestion pipeline
        ingest_documents(data_path=settings.DATA_DIR)
        
        # Reload the docstore inside global chat engine
        _reload_global_chat_engine_docstore(chat_engine)
        
        return {
            "status": "success",
            "message": f"Successfully synchronized {len(existing_files)} existing files."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Document deletion
@router.delete("/{filename}")
def delete_document_endpoint(
    filename: str,
    chat_engine: ContextChatEngine = Depends(get_global_chat_engine)
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
        result = delete_document(filename)
        if not result["deleted_from_disk"] and result["nodes_deleted_from_docstore"] == 0:
            raise HTTPException(status_code=404, detail="Document not found")
            
        # Reload the docstore inside global chat engine
        _reload_global_chat_engine_docstore(chat_engine)
            
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
    file_path = os.path.join(settings.DATA_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine the correct media type, defaulting to octet-stream
    media_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    
    return FileResponse(file_path, media_type=media_type, filename=filename)

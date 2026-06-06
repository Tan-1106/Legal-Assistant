import os
import shutil
from typing                     import List
from fastapi                    import APIRouter, UploadFile, File, HTTPException
from app.config                 import settings
from app.services.rag_pipeline  import ingest_documents, delete_document


router = APIRouter(prefix="/documents", tags=["Documents & RAG"])


@router.post("/ingest")
def ingest_endpoint(files: List[UploadFile] = File(...)):
    """
    Upload legal documents, save them to DATA_DIR, and run the ingestion pipeline.

    Args:
        files (List[UploadFile]): A list of uploaded files to process.

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
        
        return {
            "status": "success",
            "message": f"Successfully ingested {len(saved_files)} files.",
            "files": saved_files
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Manual synchronization and document deletion
@router.post("/sync")
def sync_endpoint():
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
        
        return {
            "status": "success",
            "message": f"Successfully synchronized {len(existing_files)} existing files."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Document deletion
@router.delete("/{filename}")
def delete_document_endpoint(filename: str):
    """
    Delete a document and its vectors from the system.

    Args:
        filename (str): The name of the file to delete.

    Returns:
        dict: A status dictionary detailing the deletion results.
    """
    try:
        result = delete_document(filename)
        if not result["deleted_from_disk"] and result["nodes_deleted_from_docstore"] == 0:
            raise HTTPException(status_code=404, detail="Document not found")
            
        return {
            "status": "success",
            "message": f"Successfully deleted '{filename}'",
            "details": result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

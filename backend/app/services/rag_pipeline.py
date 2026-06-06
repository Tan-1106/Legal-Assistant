import os
from qdrant_client.http                 import models as qdrant_models
from llama_index.core.storage.docstore  import SimpleDocumentStore
from llama_index.core.node_parser       import HierarchicalNodeParser, get_leaf_nodes
from llama_index.core                   import SimpleDirectoryReader, StorageContext, VectorStoreIndex
from llama_index.core.extractors        import TitleExtractor, KeywordExtractor
from llama_index.core.ingestion         import IngestionPipeline
from app.config                         import settings
from app.db.qdrant_store                import init_qdrant_vector_store


def ingest_documents(data_path: str = None):
    """
    Ingests documents from a specified directory into the vector store and document store.
    It reads documents, splits them hierarchically, extracts metadata (titles, keywords),
    and saves leaf nodes to Qdrant.

    Args:
        data_path (str, optional): The directory path containing the source documents. 
                                   Defaults to settings.DATA_DIR.

    Returns:
        VectorStoreIndex: The created or updated vector store index, or None if no documents found.
    """
    # Determine the directory path
    path = data_path or settings.DATA_DIR
    
    # Check if the data directory exists and contains documents
    if not os.path.exists(path) or len(os.listdir(path)) == 0:
        print(f"No documents found in {path}. Please add documents to ingest.")
        return
    
    # Load documents from the specified directory
    documents = SimpleDirectoryReader(path).load_data()
    
    # Initialize the Hierarchical Node Parser
    node_parser = HierarchicalNodeParser.from_defaults(
        chunk_sizes=[1024, 512, 128]
    )
    
    # Initialize Metadata Extractors (Runs on global LLM)
    extractors = [
        TitleExtractor(nodes=5),
        KeywordExtractor(keywords=5)
    ]
    
    # Run the Ingestion Pipeline
    pipeline = IngestionPipeline(
        transformations=[node_parser] + extractors
    )
    
    print("Running Ingestion Pipeline (This may take a while due to metadata extraction)...")
    nodes = pipeline.run(documents=documents)
    
    # Get leaf nodes for indexing
    leaf_nodes = get_leaf_nodes(nodes)
    
    # Load or create document store
    docstore_path = settings.DOCSTORE_PATH
    if os.path.exists(docstore_path):
        docstore = SimpleDocumentStore.from_persist_path(docstore_path)
    else:
        docstore = SimpleDocumentStore()
        
    docstore.add_documents(nodes)
    
    # Initialize the vector store
    vector_store = init_qdrant_vector_store()
    
    # Create a storage context
    storage_context = StorageContext.from_defaults(
        docstore=docstore,
        vector_store=vector_store,
    )
    
    # Create the vector store index (This adds to Qdrant)
    index = VectorStoreIndex(
        leaf_nodes,
        storage_context=storage_context
    )
    
    # Persist the docstore for AutoMergingRetriever to use later
    docstore_dir = os.path.dirname(docstore_path)
    if docstore_dir:
        os.makedirs(docstore_dir, exist_ok=True)
    docstore.persist(docstore_path)
    
    return index


def delete_document(filename: str):
    """
    Deletes a document from the local disk, Qdrant vector store, and local Docstore.

    Args:
        filename (str): The name of the file to delete (e.g., 'document.pdf').

    Returns:
        dict: A status dictionary detailing whether the file was removed from disk
              and the number of nodes deleted from the docstore.
    """
    deleted_from_disk = False
    file_path = os.path.join(settings.DATA_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        deleted_from_disk = True

    # 1. Delete from Qdrant by metadata filter
    vector_store = init_qdrant_vector_store()
    client = vector_store.client
    collection_name = settings.QDRANT_COLLECTION_NAME
    
    try:
        client.delete(
            collection_name=collection_name,
            points_selector=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="file_name",
                        match=qdrant_models.MatchValue(value=filename)
                    )
                ]
            )
        )
    except Exception as e:
        print(f"Warning: Failed to delete from Qdrant: {e}")

    # 2. Delete from Local Docstore
    docstore_path = settings.DOCSTORE_PATH
    nodes_deleted = 0
    if os.path.exists(docstore_path):
        docstore = SimpleDocumentStore.from_persist_path(docstore_path)
        
        # Find all nodes related to this file
        docs_to_delete = []
        for doc_id, doc in docstore.docs.items():
            if doc.metadata.get("file_name") == filename:
                docs_to_delete.append(doc_id)
                
        for doc_id in docs_to_delete:
            docstore.delete_document(doc_id)
            nodes_deleted += 1
            
        if nodes_deleted > 0:
            docstore.persist(docstore_path)

    return {
        "deleted_from_disk": deleted_from_disk,
        "nodes_deleted_from_docstore": nodes_deleted
    }
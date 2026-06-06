import os
from fastapi                            import Request
from llama_index.core.retrievers        import AutoMergingRetriever
from llama_index.core                   import VectorStoreIndex, StorageContext
from llama_index.core.storage.docstore  import SimpleDocumentStore
from llama_index.core.chat_engine       import ContextChatEngine
from app.config                         import settings
from app.db.qdrant_store                import init_qdrant_vector_store

def create_global_chat_engine() -> ContextChatEngine:
    """
    Initialize the stateful chat engine once.
    This builds the VectorStoreIndex from Qdrant, loads the Document Store,
    and configures the AutoMergingRetriever for the RAG pipeline.

    Returns:
        ContextChatEngine: The initialized chat engine ready to answer queries.
    """
    print("🚀 [AI Logic] Building Global Chat Engine...")
    # Initialize connection to Qdrant vector store
    vector_store = init_qdrant_vector_store()
    
    # Build index from vector_store
    index = VectorStoreIndex.from_vector_store(
        vector_store=vector_store
    )
    
    # Initialize base retriever to get the top 12 closest leaf nodes
    base_retriever = index.as_retriever(similarity_top_k=12)
    
    # Load document store from static file saved during ingest step to access Parent Nodes
    docstore_path = settings.DOCSTORE_PATH
    if os.path.exists(docstore_path):
        docstore = SimpleDocumentStore.from_persist_path(docstore_path)
    else:
        docstore = SimpleDocumentStore()
        
    # Pass both vector_store and docstore into Storage Context
    storage_context = StorageContext.from_defaults(
        vector_store=vector_store,
        docstore=docstore
    )
    
    # Use AutoMergingRetriever to merge leaf nodes into parent nodes
    retriever = AutoMergingRetriever(
        base_retriever, 
        storage_context=storage_context, 
        verbose=True
    )
    
    # Create ContextChatEngine from retriever
    chat_engine = ContextChatEngine.from_defaults(
        retriever=retriever,
        verbose=True
    )
    
    print("✅ [AI Logic] Global Chat Engine initialized successfully.")
    return chat_engine

def get_global_chat_engine(request: Request) -> ContextChatEngine:
    """
    FastAPI Dependency to retrieve the pre-initialized chat engine.

    Args:
        request (Request): The incoming FastAPI request containing app state.

    Returns:
        ContextChatEngine: The global chat engine instance.
    """
    return request.app.state.chat_engine
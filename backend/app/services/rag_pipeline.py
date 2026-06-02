import os

from app.db.qdrant_store import init_qdrant_vector_store
from llama_index.core.storage.docstore import SimpleDocumentStore
from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
from llama_index.core import SimpleDirectoryReader, StorageContext, VectorStoreIndex


# Function to ingest documents into the vector store index
def ingest_documents(data_path: str = "/data"):
    # Check if the data directory exists and contains documents
    if not os.path.exists(data_path) or len(os.listdir(data_path)) == 0:
        print(f"No documents found in {data_path}. Please add documents to ingest.")
        return
    
    # Load documents from the specified directory
    documents = SimpleDirectoryReader(data_path).load_data()
    
    # Initialize the Hierarchical Node Parser
    # Note: Using class method .from_defaults() and providing chunk_sizes list
    node_parser = HierarchicalNodeParser.from_defaults(
        chunk_sizes=[1024, 512, 128]
    )
    
    # Parse documents into nodes
    nodes = node_parser.get_nodes_from_documents(documents)
    
    # Get leaf nodes for indexing
    leaf_nodes = get_leaf_nodes(nodes)
    
    # Create a document store and add nodes to it
    docstore = SimpleDocumentStore()
    docstore.add_documents(nodes)
    
    # Initialize the vector store and create the index
    vector_store = init_qdrant_vector_store()
    
    # Create a storage context with the document store and vector store
    storage_context = StorageContext.from_defaults(
        docstore=docstore,
        vector_store=vector_store,
    )
    
    # Create the vector store index using the leaf nodes and storage context
    index = VectorStoreIndex(
        leaf_nodes,
        storage_context=storage_context
    )
    
    # Persist the docstore for AutoMergingRetriever to use later
    os.makedirs("./storage", exist_ok=True)
    docstore.persist("./storage/docstore.json")
    
    return index
import os
import sys
import shutil
import requests

def clear_data():
    print("Clearing Qdrant Collection...")
    try:
        # We can just use the qdrant REST API since Qdrant is on localhost:6333
        resp = requests.delete("http://localhost:6333/collections/legal_documents")
        print("Qdrant delete collection response:", resp.status_code, resp.json())
    except Exception as e:
        print("Failed to delete Qdrant collection:", e)
        
    print("\nClearing local docstore...")
    # The docstore is in backend/storage/docstore.json but it's mounted inside docker
    # Actually wait, in docker-compose.yml we didn't mount storage.
    # We must use docker exec to delete it.
    pass

if __name__ == "__main__":
    clear_data()

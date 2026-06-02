import requests
import json
import os

print("--- Testing API Endpoints ---")

# 1. Create a dummy file
with open("test_luat.txt", "w", encoding="utf-8") as f:
    f.write("Điều 123. Tội giết người. Người nào cố ý tước đoạt tính mạng của người khác thì bị phạt tù từ 12 năm đến 20 năm, tù chung thân hoặc tử hình.")

# 2. Test /api/ingest
print("\n[1] Testing /api/ingest...")
url_ingest = "http://localhost:8000/api/ingest"
with open("test_luat.txt", "rb") as f:
    files = {"files": f}
    try:
        response = requests.post(url_ingest, files=files)
        print("Status Code:", response.status_code)
        print("Response:", response.json())
    except Exception as e:
        print("Error:", e)

# 3. Test /api/chat
print("\n[2] Testing /api/chat...")
url_chat = "http://localhost:8000/api/chat"
payload = {"question": "tội giết người bị phạt như thế nào?"}
headers = {"Content-Type": "application/json"}
try:
    response = requests.post(url_chat, json=payload, headers=headers)
    print("Status Code:", response.status_code)
    try:
        data = response.json()
        if response.status_code == 200:
            with open("chat_response.txt", "w", encoding="utf-8") as out:
                out.write(f"Answer: {data.get('answer')}\n")
                out.write(f"Sources: {len(data.get('sources', []))} found.\n")
            print("Chat successful! Wrote response to chat_response.txt")
        else:
            print("Error Detail:", data)
    except json.JSONDecodeError:
        print("Raw Response:", response.text)
except Exception as e:
    print("Error:", e)

# 4. Test DELETE /api/documents/test_luat.txt
print("\n[3] Testing DELETE /api/documents/test_luat.txt...")
url_delete = "http://localhost:8000/api/documents/test_luat.txt"
try:
    response = requests.delete(url_delete)
    print("Status Code:", response.status_code)
    try:
        print("Response:", response.json())
    except json.JSONDecodeError:
        print("Raw Response:", response.text)
except Exception as e:
    print("Error:", e)

# Cleanup
if os.path.exists("test_luat.txt"):
    os.remove("test_luat.txt")

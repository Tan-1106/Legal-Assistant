from fastapi import FastAPI

app = FastAPI(title="Legal Assistant API")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running!"}

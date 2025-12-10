"""
File Service
Handles file uploads and downloads
Port: 8006
"""
import os
import sys
import uuid
import mimetypes
import aiofiles
from pathlib import Path
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db

app = FastAPI(title="File Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload directory
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Max file size (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


@app.on_event("startup")
async def startup():
    await connect_db()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "file"}


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    channel_id: str = Form(None)
):
    """Upload a file"""
    # Check file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    
    # Generate unique filename
    ext = Path(file.filename).suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    # Determine content type
    content_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    
    return {
        "url": f"/files/{unique_name}",
        "name": file.filename,
        "size": len(content),
        "type": content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }


@app.get("/files/{filename}")
async def get_file(filename: str):
    """Serve uploaded file"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)


@app.delete("/files/{filename}")
async def delete_file(filename: str):
    """Delete a file"""
    file_path = UPLOAD_DIR / filename
    
    if file_path.exists():
        file_path.unlink()
        return {"status": "deleted"}
    
    raise HTTPException(status_code=404, detail="File not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8006, reload=True)

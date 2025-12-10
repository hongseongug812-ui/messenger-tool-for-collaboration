"""
User Service
Handles user profiles and sessions
Port: 8002
"""
import os
import sys
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db, get_collections
from shared.auth import get_current_user_id

app = FastAPI(title="User Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await connect_db()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "user"}


@app.get("/users/me")
async def get_current_user(user_id: str = Depends(get_current_user_id)):
    """Get current user profile"""
    cols = get_collections()
    
    user_doc = await cols["users"].find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove sensitive fields
    user_doc.pop("hashed_password", None)
    user_doc["id"] = user_doc.pop("_id")
    
    return user_doc


@app.patch("/users/me")
async def update_profile(
    updates: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Update user profile"""
    cols = get_collections()
    
    # Filter allowed fields
    allowed_fields = [
        "name", "avatar", "job_title", "department",
        "extension", "phone", "location", "nickname", "status_message"
    ]
    
    update_data = {k: v for k, v in updates.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    result = await cols["users"].update_one(
        {"_id": user_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return updated user
    user_doc = await cols["users"].find_one({"_id": user_id})
    user_doc.pop("hashed_password", None)
    user_doc["id"] = user_doc.pop("_id")
    
    return user_doc


@app.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user by ID"""
    cols = get_collections()
    
    user_doc = await cols["users"].find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return public profile only
    return {
        "id": user_doc["_id"],
        "username": user_doc["username"],
        "name": user_doc["name"],
        "avatar": user_doc.get("avatar", "U"),
        "job_title": user_doc.get("job_title"),
        "department": user_doc.get("department"),
        "status_message": user_doc.get("status_message"),
    }


@app.post("/users/notification-keywords")
async def update_keywords(
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Update notification keywords"""
    cols = get_collections()
    
    keywords = data.get("keywords", [])
    
    await cols["users"].update_one(
        {"_id": user_id},
        {"$set": {"notification_keywords": keywords}}
    )
    
    return {"status": "ok", "keywords": keywords}


@app.get("/users/me/sessions")
async def get_sessions(user_id: str = Depends(get_current_user_id)):
    """Get user login sessions"""
    cols = get_collections()
    
    sessions = await cols["user_sessions"].find(
        {"user_id": user_id}
    ).sort("last_active", -1).to_list(50)
    
    return {"sessions": sessions}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)

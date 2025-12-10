"""
Server Service
Handles servers, categories, and channels
Port: 8004
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db, get_collections
from shared.auth import get_current_user_id

app = FastAPI(title="Server Service", version="1.0.0")

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
    return {"status": "ok", "service": "server"}


@app.get("/state")
async def get_state(user_id: str = Depends(get_current_user_id)):
    """Get all servers for current user"""
    cols = get_collections()
    
    # Find servers where user is a member
    cursor = cols["servers"].find({"members.id": user_id})
    servers = await cursor.to_list(length=100)
    
    result = []
    for server in servers:
        server["id"] = server.pop("_id")
        result.append(server)
    
    return {"servers": result}


@app.post("/servers")
async def create_server(
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Create a new server"""
    cols = get_collections()
    
    # Get user info
    user_doc = await cols["users"].find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    server_id = f"server_{uuid.uuid4().hex[:8]}"
    channel_id = f"channel_{uuid.uuid4().hex[:8]}"
    
    new_server = {
        "_id": server_id,
        "name": data.get("name", "New Server"),
        "icon": data.get("icon"),
        "owner_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "members": [{
            "id": user_id,
            "name": user_doc["name"],
            "avatar": user_doc.get("avatar", "U"),
            "role": "owner"
        }],
        "categories": [{
            "id": f"cat_{uuid.uuid4().hex[:8]}",
            "name": "일반",
            "channels": [{
                "id": channel_id,
                "name": "general",
                "type": "text",
                "unread": 0,
                "members": [{
                    "id": user_id,
                    "name": user_doc["name"],
                    "avatar": user_doc.get("avatar", "U"),
                    "role": "owner"
                }]
            }]
        }]
    }
    
    await cols["servers"].insert_one(new_server)
    
    new_server["id"] = new_server.pop("_id")
    return new_server


@app.patch("/servers/{server_id}")
async def update_server(
    server_id: str,
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Update server settings"""
    cols = get_collections()
    
    server = await cols["servers"].find_one({"_id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if server["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {}
    if "name" in data:
        update_data["name"] = data["name"]
    if "icon" in data:
        update_data["icon"] = data["icon"]
    
    if update_data:
        await cols["servers"].update_one(
            {"_id": server_id},
            {"$set": update_data}
        )
    
    return {"status": "ok"}


@app.delete("/servers/{server_id}")
async def delete_server(
    server_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a server"""
    cols = get_collections()
    
    server = await cols["servers"].find_one({"_id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if server["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await cols["servers"].delete_one({"_id": server_id})
    
    return {"status": "deleted"}


# Categories
@app.post("/servers/{server_id}/categories")
async def create_category(
    server_id: str,
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Create a new category"""
    cols = get_collections()
    
    category_id = f"cat_{uuid.uuid4().hex[:8]}"
    
    new_category = {
        "id": category_id,
        "name": data.get("name", "New Category"),
        "channels": []
    }
    
    result = await cols["servers"].update_one(
        {"_id": server_id},
        {"$push": {"categories": new_category}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
    
    return new_category


# Channels
@app.post("/servers/{server_id}/categories/{category_id}/channels")
async def create_channel(
    server_id: str,
    category_id: str,
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Create a new channel"""
    cols = get_collections()
    
    channel_id = f"channel_{uuid.uuid4().hex[:8]}"
    
    new_channel = {
        "id": channel_id,
        "name": data.get("name", "new-channel"),
        "type": data.get("type", "text"),
        "unread": 0,
        "members": []
    }
    
    result = await cols["servers"].update_one(
        {"_id": server_id, "categories.id": category_id},
        {"$push": {"categories.$.channels": new_channel}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return new_channel


# Members
@app.post("/servers/{server_id}/members")
async def add_member(
    server_id: str,
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Add member to server"""
    cols = get_collections()
    
    # Find user to add
    target_user = await cols["users"].find_one({"username": data.get("username")})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_member = {
        "id": target_user["_id"],
        "name": target_user["name"],
        "avatar": target_user.get("avatar", "U"),
        "role": "member"
    }
    
    result = await cols["servers"].update_one(
        {"_id": server_id},
        {"$push": {"members": new_member}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
    
    return new_member


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)

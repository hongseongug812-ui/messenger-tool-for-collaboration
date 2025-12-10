"""
Messaging Service
Handles messages, channels, and Socket.IO events
Port: 8003
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
import socketio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db, get_collections
from shared.auth import get_current_user_id
from shared.encryption import encrypt_text, decrypt_text

app = FastAPI(title="Messaging Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Online users tracking
online_users = {}  # sid -> user_id


@app.on_event("startup")
async def startup():
    await connect_db()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "messaging"}


@app.get("/channels/{channel_id}/messages")
async def get_messages(
    channel_id: str,
    limit: int = 50,
    before: str = None
):
    """Get messages for a channel"""
    cols = get_collections()
    
    query = {"channel_id": channel_id, "thread_id": None}
    
    if before:
        query["_id"] = {"$lt": before}
    
    cursor = cols["messages"].find(query).sort("timestamp", -1).limit(limit)
    messages = await cursor.to_list(length=limit)
    
    # Decrypt and format
    result = []
    for msg in reversed(messages):
        msg["id"] = msg.pop("_id")
        if msg.get("content"):
            msg["content"] = decrypt_text(msg["content"])
        result.append(msg)
    
    return result


@app.post("/channels/{channel_id}/messages")
async def create_message(
    channel_id: str,
    message_data: dict = Body(...)
):
    """Create a new message"""
    cols = get_collections()
    
    content = message_data.get("content", "")
    sender = message_data.get("sender", {})
    files = message_data.get("files", [])
    thread_id = message_data.get("thread_id")
    
    # Create message
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    
    new_message = {
        "_id": message_id,
        "channel_id": channel_id,
        "sender": sender,
        "content": encrypt_text(content),
        "timestamp": datetime.now(timezone.utc),
        "files": files,
        "thread_id": thread_id,
        "reply_count": 0,
        "edited_at": None,
        "is_deleted": False,
        "is_pinned": False,
        "reactions": [],
    }
    
    await cols["messages"].insert_one(new_message)
    
    # If thread reply, update parent count
    if thread_id:
        await cols["messages"].update_one(
            {"_id": thread_id},
            {"$inc": {"reply_count": 1}}
        )
    
    # Emit via Socket.IO
    response_msg = dict(new_message)
    response_msg["id"] = response_msg.pop("_id")
    response_msg["content"] = content  # Return decrypted
    
    await sio.emit("message", {
        "channelId": channel_id,
        "message": response_msg
    }, room=channel_id)
    
    return response_msg


@app.patch("/messages/{message_id}")
async def edit_message(
    message_id: str,
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Edit a message"""
    cols = get_collections()
    
    msg = await cols["messages"].find_one({"_id": message_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if msg["sender"].get("id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    new_content = data.get("content", "")
    
    await cols["messages"].update_one(
        {"_id": message_id},
        {
            "$set": {
                "content": encrypt_text(new_content),
                "edited_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Emit update
    await sio.emit("message_edited", {
        "channelId": msg["channel_id"],
        "messageId": message_id,
        "content": new_content
    }, room=msg["channel_id"])
    
    return {"status": "ok"}


@app.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a message"""
    cols = get_collections()
    
    msg = await cols["messages"].find_one({"_id": message_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    await cols["messages"].update_one(
        {"_id": message_id},
        {"$set": {"is_deleted": True, "content": encrypt_text("[삭제된 메시지]")}}
    )
    
    await sio.emit("message_deleted", {
        "channelId": msg["channel_id"],
        "messageId": message_id
    }, room=msg["channel_id"])
    
    return {"status": "deleted"}


# Reactions
@app.post("/messages/{message_id}/reactions")
async def add_reaction(
    message_id: str,
    emoji: str = Body(...),
    user_id: str = Body(...)
):
    """Add emoji reaction"""
    cols = get_collections()
    
    msg = await cols["messages"].find_one({"_id": message_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    reactions = msg.get("reactions", [])
    
    # Find existing reaction
    for reaction in reactions:
        if reaction["emoji"] == emoji:
            if user_id not in reaction["users"]:
                reaction["users"].append(user_id)
            break
    else:
        reactions.append({"emoji": emoji, "users": [user_id]})
    
    await cols["messages"].update_one(
        {"_id": message_id},
        {"$set": {"reactions": reactions}}
    )
    
    await sio.emit("reaction_added", {
        "channelId": msg["channel_id"],
        "messageId": message_id,
        "emoji": emoji,
        "userId": user_id,
        "reactions": reactions
    }, room=msg["channel_id"])
    
    return {"status": "added", "reactions": reactions}


# Socket.IO Events
@sio.event
async def connect(sid, environ):
    print(f"[Messaging] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    if sid in online_users:
        del online_users[sid]
    print(f"[Messaging] Client disconnected: {sid}")


@sio.event
async def join(sid, data):
    channel_id = data.get("channelId")
    user_id = data.get("userId")
    
    if channel_id:
        sio.enter_room(sid, channel_id)
        if user_id:
            online_users[sid] = user_id
        print(f"[Messaging] {sid} joined {channel_id}")


@sio.event
async def leave(sid, data):
    channel_id = data.get("channelId")
    if channel_id:
        sio.leave_room(sid, channel_id)


@sio.event
async def typing_start(sid, data):
    channel_id = data.get("channelId")
    user_id = online_users.get(sid)
    if channel_id and user_id:
        await sio.emit("typing_start", {
            "channelId": channel_id,
            "userId": user_id
        }, room=channel_id, skip_sid=sid)


@sio.event
async def typing_stop(sid, data):
    channel_id = data.get("channelId")
    user_id = online_users.get(sid)
    if channel_id and user_id:
        await sio.emit("typing_stop", {
            "channelId": channel_id,
            "userId": user_id
        }, room=channel_id, skip_sid=sid)


# Whiteboard events
@sio.event
async def whiteboard_draw(sid, data):
    channel_id = data.get("channelId")
    if channel_id:
        await sio.emit("whiteboard_draw", data, room=channel_id, skip_sid=sid)


@sio.event
async def whiteboard_clear(sid, data):
    channel_id = data.get("channelId")
    if channel_id:
        await sio.emit("whiteboard_clear", data, room=channel_id, skip_sid=sid)


# Export with Socket.IO
app = socket_app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)

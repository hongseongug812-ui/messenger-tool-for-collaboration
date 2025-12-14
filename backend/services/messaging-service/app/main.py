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
from socketio import AsyncRedisManager

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

# Redis URL from environment variable (default: redis://redis:6379)
redis_url = os.getenv("REDIS_URL", "redis://redis:6379")

# Socket.IO with Redis Manager for horizontal scaling
redis_manager = AsyncRedisManager(url=redis_url)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    client_manager=redis_manager
)
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


# ========================================
# WebRTC Signaling Events
# ========================================

# 통화 참가자 추적
call_participants = {}  # channel_id -> {sid: user_info}

# 서버별 사용자 추적 (어떤 sid가 어떤 서버에 있는지)
user_servers = {}  # sid -> server_id


@sio.event
async def join_server(sid, data):
    """사용자가 서버에 접속할 때 서버 룸에 참가"""
    server_id = data.get("serverId")
    user_id = data.get("userId")
    
    if not server_id:
        return
    
    # 이전 서버에서 나가기
    old_server = user_servers.get(sid)
    if old_server and old_server != server_id:
        sio.leave_room(sid, f"server_{old_server}")
    
    # 새 서버 룸에 참가
    sio.enter_room(sid, f"server_{server_id}")
    user_servers[sid] = server_id
    
    if user_id:
        online_users[sid] = user_id
    
    print(f"[Messaging] {sid} joined server room server_{server_id}")
    
    # 현재 서버의 모든 음성 채널 참가자 상태 전송
    voice_states = {}
    for channel_id, participants in call_participants.items():
        if len(participants) > 0:
            voice_states[channel_id] = list(participants.values())
    
    await sio.emit("voice_state_update", {
        "serverId": server_id,
        "voiceStates": voice_states
    }, to=sid)


@sio.event
async def leave_server(sid, data):
    """사용자가 서버에서 나갈 때"""
    server_id = data.get("serverId")
    if server_id:
        sio.leave_room(sid, f"server_{server_id}")
        if sid in user_servers:
            del user_servers[sid]
        print(f"[Messaging] {sid} left server room server_{server_id}")


@sio.event
async def call_join(sid, data):
    """음성 채널 참여"""
    channel_id = data.get("currentChannelId") or data.get("channelId")
    server_id = data.get("serverId")
    user_id = online_users.get(sid)
    user_name = data.get("userName", "User")
    
    print(f"[WebRTC] {sid} joining call in {channel_id}, server: {server_id}")
    
    if not channel_id:
        return
    
    # 채널의 통화 참가자 목록에 추가
    if channel_id not in call_participants:
        call_participants[channel_id] = {}
    
    call_participants[channel_id][sid] = {
        "id": user_id,
        "name": user_name,
        "isScreenSharing": False
    }
    
    # 해당 채널 room에 참가
    sio.enter_room(sid, f"call_{channel_id}")
    
    # 기존 참가자들에게 새 참가자 알림 (P2P 연결용)
    await sio.emit("user_joined", {
        "channelId": channel_id,
        "callerId": sid,
        "userId": user_id,
        "userName": user_name,
        "participants": list(call_participants[channel_id].values())
    }, room=f"call_{channel_id}", skip_sid=sid)
    
    # 새 참가자에게 현재 참가자 목록 전송
    await sio.emit("call_participants", {
        "channelId": channel_id,
        "participants": list(call_participants[channel_id].values()),
        "existingPeers": [s for s in call_participants[channel_id].keys() if s != sid]
    }, to=sid)
    
    # ★ 서버 룸에 음성 상태 업데이트 브로드캐스트 (모든 서버 멤버가 볼 수 있도록)
    if server_id:
        await sio.emit("voice_state_update", {
            "serverId": server_id,
            "channelId": channel_id,
            "participants": list(call_participants[channel_id].values())
        }, room=f"server_{server_id}")


@sio.event
async def call_leave(sid, data):
    """음성 채널 퇴장"""
    channel_id = data.get("channelId")
    server_id = data.get("serverId")
    
    print(f"[WebRTC] {sid} leaving call in {channel_id}, server: {server_id}")
    
    if channel_id and channel_id in call_participants:
        if sid in call_participants[channel_id]:
            del call_participants[channel_id][sid]
        
        remaining_participants = list(call_participants[channel_id].values())
        
        # 다른 참가자들에게 알림 (P2P 연결 정리용)
        await sio.emit("user_left", {
            "channelId": channel_id,
            "callerId": sid,
            "participants": remaining_participants
        }, room=f"call_{channel_id}")
        
        sio.leave_room(sid, f"call_{channel_id}")
        
        # ★ 서버 룸에 음성 상태 업데이트 브로드캐스트 (모든 서버 멤버가 볼 수 있도록)
        if server_id:
            await sio.emit("voice_state_update", {
                "serverId": server_id,
                "channelId": channel_id,
                "participants": remaining_participants
            }, room=f"server_{server_id}")
        
        # 참가자가 없으면 정리
        if not call_participants[channel_id]:
            del call_participants[channel_id]


@sio.event
async def webrtc_offer(sid, data):
    """WebRTC offer 전달"""
    target_sid = data.get("targetSid")
    offer = data.get("offer")
    channel_id = data.get("channelId")
    
    print(f"[WebRTC] Relaying offer from {sid} to {target_sid}")
    
    if target_sid and offer:
        await sio.emit("webrtc_offer", {
            "fromSid": sid,
            "offer": offer,
            "channelId": channel_id
        }, to=target_sid)


@sio.event
async def webrtc_answer(sid, data):
    """WebRTC answer 전달"""
    target_sid = data.get("targetSid")
    answer = data.get("answer")
    channel_id = data.get("channelId")
    
    print(f"[WebRTC] Relaying answer from {sid} to {target_sid}")
    
    if target_sid and answer:
        await sio.emit("webrtc_answer", {
            "fromSid": sid,
            "answer": answer,
            "channelId": channel_id
        }, to=target_sid)


@sio.event
async def webrtc_ice_candidate(sid, data):
    """ICE candidate 전달"""
    target_sid = data.get("targetSid")
    candidate = data.get("candidate")
    
    if target_sid and candidate:
        await sio.emit("webrtc_ice_candidate", {
            "fromSid": sid,
            "candidate": candidate
        }, to=target_sid)


@sio.event
async def screen_share_started(sid, data):
    """화면 공유 시작 알림"""
    channel_id = data.get("channelId")
    user_id = online_users.get(sid)
    
    print(f"[WebRTC] Screen share started by {sid} in {channel_id}")
    
    if channel_id and channel_id in call_participants and sid in call_participants[channel_id]:
        call_participants[channel_id][sid]["isScreenSharing"] = True
        
        await sio.emit("screen_share_started", {
            "channelId": channel_id,
            "callerId": sid,
            "userId": user_id
        }, room=f"call_{channel_id}", skip_sid=sid)


@sio.event
async def screen_share_stopped(sid, data):
    """화면 공유 종료 알림"""
    channel_id = data.get("channelId")
    user_id = online_users.get(sid)
    
    if channel_id and channel_id in call_participants and sid in call_participants[channel_id]:
        call_participants[channel_id][sid]["isScreenSharing"] = False
        
        await sio.emit("screen_share_stopped", {
            "channelId": channel_id,
            "callerId": sid,
            "userId": user_id
        }, room=f"call_{channel_id}", skip_sid=sid)


# Export with Socket.IO
app = socket_app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)

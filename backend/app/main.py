import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field


def _get_list_env(key: str, default: List[str]) -> List[str]:
  raw = os.getenv(key)
  if not raw:
    return default
  return [item.strip() for item in raw.split(",") if item.strip()]


def _now():
  return datetime.now(timezone.utc)


# 환경 변수
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "work_messenger")
cors_origins = _get_list_env(
    "BACKEND_CORS_ORIGINS",
    ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"],
)

# DB 클라이언트
mongo_client = AsyncIOMotorClient(MONGO_URI)
mongo_db = mongo_client[MONGO_DB]
servers_col = mongo_db["servers"]
messages_col = mongo_db["messages"]

# Socket.IO 서버 (ASGI)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=cors_origins or "*",
    allow_upgrades=True,
)

# FastAPI 앱
fastapi_app = FastAPI(title="Work Messenger Backend", version="0.2.0")
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# 데이터 모델
# -----------------------------
class Sender(BaseModel):
  id: Optional[str] = None
  name: str = Field(..., min_length=1, max_length=80)
  avatar: str = Field("U", min_length=1, max_length=2)


class FileAttachment(BaseModel):
  id: str
  name: str
  size: Optional[int] = None
  type: Optional[str] = None
  url: Optional[str] = None


class Channel(BaseModel):
  id: str
  name: str
  type: str = "text"
  unread: int = 0


class Category(BaseModel):
  id: str
  name: str
  collapsed: bool = False
  channels: List[Channel] = Field(default_factory=list)


class Server(BaseModel):
  id: str
  name: str
  avatar: str = "S"
  categories: List[Category] = Field(default_factory=list)
  created_at: datetime


class ServerCreate(BaseModel):
  name: str = Field(..., min_length=1, max_length=80)
  avatar: Optional[str] = Field(default=None, max_length=2)


class CategoryCreate(BaseModel):
  name: str = Field(..., min_length=1, max_length=80)
  collapsed: bool = False


class CategoryUpdate(BaseModel):
  name: Optional[str] = Field(default=None, min_length=1, max_length=80)
  collapsed: Optional[bool] = None


class ChannelCreate(BaseModel):
  name: str = Field(..., min_length=1, max_length=80)
  type: str = "text"


class ChannelUpdate(BaseModel):
  name: Optional[str] = Field(default=None, min_length=1, max_length=80)


class Message(BaseModel):
  id: str
  channel_id: str
  sender: Sender
  content: str
  timestamp: datetime
  files: List[FileAttachment] = Field(default_factory=list)


class MessageCreate(BaseModel):
  sender: Sender
  content: str = Field("", max_length=4000)
  files: List[FileAttachment] = Field(default_factory=list)


class StateResponse(BaseModel):
  servers: List[Server]


# -----------------------------
# 유틸 함수
# -----------------------------
def _server_doc_to_model(doc: Dict) -> Server:
  return Server(
      id=doc["_id"],
      name=doc["name"],
      avatar=doc.get("avatar") or doc["name"][:1],
      categories=[Category(**cat) for cat in doc.get("categories", [])],
      created_at=doc.get("created_at", _now()),
  )


async def _ensure_channel(channel_id: str):
  server_doc = await servers_col.find_one({"categories.channels.id": channel_id})
  if not server_doc:
    return None, None, None

  server = _server_doc_to_model(server_doc)
  target_category = None
  target_channel = None
  for category in server.categories:
    for ch in category.channels:
      if ch.id == channel_id:
        target_category = category
        target_channel = ch
        break
  return server, target_category, target_channel


def _build_sender(payload: Sender) -> Sender:
  avatar = payload.avatar or (payload.name[:1] if payload.name else "U")
  return Sender(id=payload.id, name=payload.name, avatar=avatar)


def _message_to_response(msg: Message) -> Dict:
  data = msg.model_dump()
  data["timestamp"] = msg.timestamp.isoformat()
  return data


# -----------------------------
# REST API
# -----------------------------
@fastapi_app.get("/health")
async def health():
  return {"status": "ok", "message": "work-messenger backend alive"}


@fastapi_app.get("/state", response_model=StateResponse)
async def get_state():
  servers_cursor = servers_col.find({})
  servers: List[Server] = []
  async for doc in servers_cursor:
    servers.append(_server_doc_to_model(doc))
  return {"servers": servers}


@fastapi_app.post("/servers", response_model=Server, status_code=201)
async def create_server(payload: ServerCreate):
  server_id = f"server_{uuid.uuid4().hex[:10]}"
  default_category = Category(
      id=f"cat_{uuid.uuid4().hex[:8]}",
      name="텍스트 채널",
      channels=[
          Channel(
              id=f"channel_{uuid.uuid4().hex[:8]}",
              name="일반",
              type="text",
          )
      ],
  )
  doc = {
      "_id": server_id,
      "name": payload.name,
      "avatar": payload.avatar or payload.name[:1],
      "categories": [default_category.model_dump()],
      "created_at": _now(),
  }
  await servers_col.insert_one(doc)
  return _server_doc_to_model(doc)


@fastapi_app.post(
    "/servers/{server_id}/categories",
    response_model=Category,
    status_code=201,
)
async def create_category(server_id: str, payload: CategoryCreate):
  category = Category(
      id=f"cat_{uuid.uuid4().hex[:8]}",
      name=payload.name,
      collapsed=payload.collapsed,
      channels=[],
  )
  result = await servers_col.update_one(
      {"_id": server_id},
      {"$push": {"categories": category.model_dump()}},
  )
  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="Server not found")
  return category


@fastapi_app.patch(
    "/servers/{server_id}/categories/{category_id}",
    response_model=Category,
)
async def update_category(server_id: str, category_id: str, payload: CategoryUpdate):
  updates = {}
  if payload.name is not None:
    updates["categories.$[cat].name"] = payload.name
  if payload.collapsed is not None:
    updates["categories.$[cat].collapsed"] = payload.collapsed

  if not updates:
    raise HTTPException(status_code=400, detail="No updates provided")

  result = await servers_col.update_one(
      {"_id": server_id},
      {"$set": updates},
      array_filters=[{"cat.id": category_id}],
  )
  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="Server not found")

  server_doc = await servers_col.find_one({"_id": server_id})
  server = _server_doc_to_model(server_doc)
  category = next((c for c in server.categories if c.id == category_id), None)
  if not category:
    raise HTTPException(status_code=404, detail="Category not found")
  return category


@fastapi_app.delete(
    "/servers/{server_id}/categories/{category_id}",
    status_code=204,
)
async def delete_category(server_id: str, category_id: str):
  server_doc = await servers_col.find_one({"_id": server_id})
  if not server_doc:
    raise HTTPException(status_code=404, detail="Server not found")

  server = _server_doc_to_model(server_doc)
  category = next((c for c in server.categories if c.id == category_id), None)
  if not category:
    raise HTTPException(status_code=404, detail="Category not found")

  # 삭제된 카테고리의 메시지 삭제
  channel_ids = [ch.id for ch in category.channels]
  if channel_ids:
    await messages_col.delete_many({"channel_id": {"$in": channel_ids}})

  await servers_col.update_one(
      {"_id": server_id},
      {"$pull": {"categories": {"id": category_id}}},
  )
  return None


@fastapi_app.post(
    "/servers/{server_id}/categories/{category_id}/channels",
    response_model=Channel,
    status_code=201,
)
async def create_channel(server_id: str, category_id: str, payload: ChannelCreate):
  channel = Channel(
      id=f"channel_{uuid.uuid4().hex[:8]}",
      name=payload.name,
      type=payload.type,
      unread=0,
  )
  result = await servers_col.update_one(
      {"_id": server_id},
      {"$push": {"categories.$[cat].channels": channel.model_dump()}},
      array_filters=[{"cat.id": category_id}],
  )
  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="Server not found")
  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="Category not found")
  return channel


@fastapi_app.patch(
    "/servers/{server_id}/categories/{category_id}/channels/{channel_id}",
    response_model=Channel,
)
async def update_channel(server_id: str, category_id: str, channel_id: str, payload: ChannelUpdate):
  updates = {}
  if payload.name is not None:
    updates["categories.$[cat].channels.$[ch].name"] = payload.name
  if not updates:
    raise HTTPException(status_code=400, detail="No updates provided")

  result = await servers_col.update_one(
      {"_id": server_id},
      {"$set": updates},
      array_filters=[{"cat.id": category_id}, {"ch.id": channel_id}],
  )
  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="Server not found")
  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="Channel not found")

  server_doc = await servers_col.find_one({"_id": server_id})
  server = _server_doc_to_model(server_doc)
  category = next((c for c in server.categories if c.id == category_id), None)
  if not category:
    raise HTTPException(status_code=404, detail="Category not found")
  channel = next((c for c in category.channels if c.id == channel_id), None)
  if not channel:
    raise HTTPException(status_code=404, detail="Channel not found")
  return channel


@fastapi_app.delete(
    "/servers/{server_id}/categories/{category_id}/channels/{channel_id}",
    status_code=204,
)
async def delete_channel(server_id: str, category_id: str, channel_id: str):
  result = await servers_col.update_one(
      {"_id": server_id},
      {"$pull": {"categories.$[cat].channels": {"id": channel_id}}},
      array_filters=[{"cat.id": category_id}],
  )
  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="Server not found")
  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="Channel not found")

  await messages_col.delete_many({"channel_id": channel_id})
  return None


@fastapi_app.get(
    "/channels/{channel_id}/messages",
    response_model=List[Message],
)
async def list_messages(channel_id: str):
  server, category, channel = await _ensure_channel(channel_id)
  if not channel:
    raise HTTPException(status_code=404, detail="Channel not found")

  cursor = messages_col.find({"channel_id": channel_id}).sort("timestamp", 1)
  messages: List[Message] = []
  async for doc in cursor:
    messages.append(
        Message(
            id=doc["_id"],
            channel_id=doc["channel_id"],
            sender=Sender(**doc["sender"]),
            content=doc["content"],
            timestamp=doc["timestamp"],
            files=[FileAttachment(**f) for f in doc.get("files", [])],
        )
    )
  return messages


@fastapi_app.post(
    "/channels/{channel_id}/messages",
    response_model=Message,
    status_code=201,
)
async def create_message(channel_id: str, payload: MessageCreate):
  server, category, channel = await _ensure_channel(channel_id)
  if not channel:
    raise HTTPException(status_code=404, detail="Channel not found")

  sender = _build_sender(payload.sender)
  message = Message(
      id=f"msg_{uuid.uuid4().hex[:12]}",
      channel_id=channel_id,
      sender=sender,
      content=payload.content,
      timestamp=_now(),
      files=payload.files,
  )

  await messages_col.insert_one(
      {
          "_id": message.id,
          "channel_id": channel_id,
          "sender": sender.model_dump(),
          "content": message.content,
          "timestamp": message.timestamp,
          "files": [f.model_dump() for f in message.files],
      }
  )

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message)},
      room=channel_id,
  )
  return message


# -----------------------------
# Socket.IO 이벤트
# -----------------------------
@sio.event
async def connect(sid, environ):
  await sio.save_session(sid, {"channels": []})


@sio.event
async def disconnect(sid):
  await sio.save_session(sid, {"channels": []})


@sio.event
async def join(sid, data):
  channel_id = data.get("channelId") or data.get("channel_id")
  server, category, channel = await _ensure_channel(channel_id)
  if not channel:
    return False

  await sio.enter_room(sid, channel_id)
  session = await sio.get_session(sid)
  channels = set(session.get("channels", []))
  channels.add(channel_id)
  await sio.save_session(sid, {"channels": list(channels)})
  await sio.emit("joined", {"channelId": channel_id}, to=sid)
  return True


@sio.event
async def leave(sid, data):
  channel_id = data.get("channelId") or data.get("channel_id")
  if not channel_id:
    return False
  await sio.leave_room(sid, channel_id)
  session = await sio.get_session(sid)
  channels = set(session.get("channels", []))
  channels.discard(channel_id)
  await sio.save_session(sid, {"channels": list(channels)})
  await sio.emit("left", {"channelId": channel_id}, to=sid)
  return True


@sio.event
async def message(sid, data):
  channel_id = data.get("channelId") or data.get("channel_id")
  raw_message = data.get("message") or {}
  sender_payload = raw_message.get("sender")
  content = raw_message.get("content") or ""
  files_payload = raw_message.get("files") or []

  if not channel_id:
    return False

  server, category, channel = await _ensure_channel(channel_id)
  if not channel:
    return False

  if isinstance(sender_payload, dict):
    sender_model = Sender(
        id=sender_payload.get("id"),
        name=sender_payload.get("name") or "익명",
        avatar=sender_payload.get("avatar") or sender_payload.get("name", "U")[:1],
    )
  else:
    sender_model = Sender(name=str(sender_payload or "익명"), avatar=str(sender_payload or "익")[0])

  message_obj = Message(
      id=f"msg_{uuid.uuid4().hex[:12]}",
      channel_id=channel_id,
      sender=_build_sender(sender_model),
      content=content,
      timestamp=_now(),
      files=[FileAttachment(**f) for f in files_payload],
  )

  await messages_col.insert_one(
      {
          "_id": message_obj.id,
          "channel_id": channel_id,
          "sender": message_obj.sender.model_dump(),
          "content": message_obj.content,
          "timestamp": message_obj.timestamp,
          "files": [f.model_dump() for f in message_obj.files],
      }
  )

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message_obj)},
      room=channel_id,
  )
  return True


# uvicorn entrypoint expects `app`
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

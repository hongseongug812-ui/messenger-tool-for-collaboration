import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import socketio
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr


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
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7일

cors_origins = _get_list_env(
    "BACKEND_CORS_ORIGINS",
    ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"],
)

# DB 클라이언트
mongo_client = AsyncIOMotorClient(MONGO_URI)
mongo_db = mongo_client[MONGO_DB]
servers_col = mongo_db["servers"]
messages_col = mongo_db["messages"]
users_col = mongo_db["users"]

# 비밀번호 해싱 및 인증 스킴 (bcrypt 72바이트 제한 회피를 위해 bcrypt_sha256 사용)
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")
security = HTTPBearer()

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


async def _log_mongo_connection():
  try:
    await mongo_db.command("ping")
    print(f"[backend] MongoDB 연결 성공: {MONGO_URI} / DB={MONGO_DB}")
  except Exception as exc:
    print(f"[backend] MongoDB 연결 실패: {exc}")


# 초기 데이터 부트스트랩 (MongoDB에 서버/메시지가 없을 때)
@fastapi_app.on_event("startup")
async def bootstrap_default_data():
  await _log_mongo_connection()
  server_count = await servers_col.estimated_document_count()
  if server_count > 0:
    return

  default_server_id = "server_default"
  default_category_id = "cat_default"
  default_channel_id = "channel_default"

  default_server = {
      "_id": default_server_id,
      "name": "회사 워크스페이스",
      "avatar": "회",
      "categories": [
          {
              "id": default_category_id,
              "name": "텍스트 채널",
              "collapsed": False,
              "channels": [
                  {
                      "id": default_channel_id,
                      "name": "일반",
                      "type": "text",
                      "unread": 0,
                  }
              ],
          }
      ],
      "created_at": _now(),
  }

  default_messages = [
      {
          "_id": "msg_default_1",
          "channel_id": default_channel_id,
          "sender": {"id": "user_system", "name": "시스템", "avatar": "S"},
          "content": "Work Messenger 백엔드가 MongoDB와 연결되었습니다.",
          "timestamp": _now(),
          "files": [],
      },
      {
          "_id": "msg_default_2",
          "channel_id": default_channel_id,
          "sender": {"id": "user_demo", "name": "데모", "avatar": "D"},
          "content": "새 메시지를 입력해보세요!",
          "timestamp": _now(),
          "files": [],
      },
  ]

  await servers_col.insert_one(default_server)
  await messages_col.insert_many(default_messages)


# -----------------------------
# 데이터 모델
# -----------------------------
# 사용자 인증 모델
class UserSignup(BaseModel):
  username: str = Field(..., min_length=3, max_length=30)
  name: str = Field(..., min_length=1, max_length=50)
  email: EmailStr
  password: str = Field(..., min_length=6, max_length=72)


class UserLogin(BaseModel):
  username: str
  password: str


class User(BaseModel):
  id: str
  username: str
  name: str
  email: str
  avatar: str
  created_at: datetime


class UserInDB(User):
  hashed_password: str


class Token(BaseModel):
  access_token: str
  token_type: str


class TokenData(BaseModel):
  username: Optional[str] = None


class AuthResponse(BaseModel):
  access_token: str
  token_type: str
  user: User



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


class ChannelMember(BaseModel):
  id: str
  name: str
  avatar: str
  status: str = "offline"  # online, offline, away


class Channel(BaseModel):
  id: str
  name: str
  type: str = "text"
  unread: int = 0
  members: List[ChannelMember] = Field(default_factory=list)


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


class InviteRequest(BaseModel):
  user_id: Optional[str] = None
  username: Optional[str] = None
  email: Optional[str] = None
  channel_ids: Optional[List[str]] = None


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
# 비밀번호 해싱 및 검증
def hash_password(password: str) -> str:
  return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
  return pwd_context.verify(plain_password, hashed_password)


def ensure_password_length(password: str):
  # bcrypt 계열은 72바이트 제한이 있어 사전에 차단
  if len(password.encode("utf-8")) > 72:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Password too long (max 72 bytes)"
    )


# JWT 토큰 생성 및 검증
def create_access_token(data: dict) -> str:
  to_encode = data.copy()
  expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
  to_encode.update({"exp": expire})
  encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
  return encoded_jwt


def decode_access_token(token: str) -> Optional[TokenData]:
  try:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    username: str = payload.get("sub")
    if username is None:
      return None
    return TokenData(username=username)
  except JWTError:
    return None


# 현재 사용자 가져오기
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
  token = credentials.credentials
  token_data = decode_access_token(token)
  if token_data is None or token_data.username is None:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid authentication credentials",
      headers={"WWW-Authenticate": "Bearer"},
    )

  user_doc = await users_col.find_one({"username": token_data.username})
  if user_doc is None:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="User not found",
      headers={"WWW-Authenticate": "Bearer"},
    )

  return User(
    id=user_doc["_id"],
    username=user_doc["username"],
    name=user_doc["name"],
    email=user_doc["email"],
    avatar=user_doc["avatar"],
    created_at=user_doc["created_at"],
  )

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


# -----------------------------
# 인증 API
# -----------------------------
@fastapi_app.post("/auth/signup", response_model=AuthResponse, status_code=201)
async def signup(user_data: UserSignup):
  # 사용자명/이메일 중복 검사
  if await users_col.find_one({"username": user_data.username}):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")
  if await users_col.find_one({"email": user_data.email}):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

  ensure_password_length(user_data.password)

  user_id = f"user_{uuid.uuid4().hex[:12]}"
  hashed_password = hash_password(user_data.password)
  avatar = user_data.name[:1].upper()

  user_doc = {
      "_id": user_id,
      "username": user_data.username,
      "name": user_data.name,
      "email": user_data.email,
      "avatar": avatar,
      "hashed_password": hashed_password,
      "created_at": _now(),
  }

  await users_col.insert_one(user_doc)

  access_token = create_access_token(data={"sub": user_data.username})
  user = User(
      id=user_id,
      username=user_data.username,
      name=user_data.name,
      email=user_data.email,
      avatar=avatar,
      created_at=user_doc["created_at"],
  )

  return AuthResponse(access_token=access_token, token_type="bearer", user=user)


@fastapi_app.post("/auth/login", response_model=AuthResponse)
async def login(credentials: UserLogin):
  user_doc = await users_col.find_one({"username": credentials.username})
  ensure_password_length(credentials.password)

  if not user_doc or not verify_password(credentials.password, user_doc.get("hashed_password", "")):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

  access_token = create_access_token(data={"sub": credentials.username})
  user = User(
      id=user_doc["_id"],
      username=user_doc["username"],
      name=user_doc["name"],
      email=user_doc["email"],
      avatar=user_doc["avatar"],
      created_at=user_doc["created_at"],
  )
  return AuthResponse(access_token=access_token, token_type="bearer", user=user)


@fastapi_app.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
  return current_user


@fastapi_app.post("/auth/logout")
async def logout():
  # JWT는 상태가 없으므로 클라이언트에서 토큰을 삭제하도록 안내만 반환
  return {"status": "ok", "message": "logged out"}


# -----------------------------
# 서버 및 채널 API
# -----------------------------
@fastapi_app.get("/state", response_model=StateResponse)
async def get_state(current_user: User = Depends(get_current_user)):
  # 가입한 서버만 조회
  servers_cursor = servers_col.find({"members.id": current_user.id})
  servers: List[Server] = []
  async for doc in servers_cursor:
    servers.append(_server_doc_to_model(doc))
  return {"servers": servers}


@fastapi_app.post("/servers", response_model=Server, status_code=201)
async def create_server(payload: ServerCreate, current_user: User = Depends(get_current_user)):
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

  owner_member = {
      "id": current_user.id,
      "name": current_user.name,
      "avatar": current_user.avatar or current_user.name[:1],
      "status": "online",
  }

  doc = {
      "_id": server_id,
      "name": payload.name,
      "avatar": payload.avatar or payload.name[:1],
      "categories": [default_category.model_dump()],
      "members": [owner_member],
      "created_at": _now(),
  }
  await servers_col.insert_one(doc)
  return _server_doc_to_model(doc)


@fastapi_app.post("/servers/{server_id}/invite", response_model=Server)
async def invite_to_server(server_id: str, payload: InviteRequest, current_user: User = Depends(get_current_user)):
  # 서버 존재 및 권한 확인 (현재 사용자가 멤버인지 확인)
  server_doc = await servers_col.find_one({"_id": server_id, "members.id": current_user.id})
  if not server_doc:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed or server not found")

  # 초대 대상 사용자 확인 (ID, username, email 중 하나로 조회)
  query = []
  if payload.user_id:
    query.append({"_id": payload.user_id})
  if payload.username:
    query.append({"username": payload.username})
  if payload.email:
    query.append({"email": payload.email})
  if not query:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id, username, or email is required")

  target_user = await users_col.find_one({"$or": query})
  if not target_user:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

  member = await _get_member_summary(target_user["_id"])
  member["status"] = "offline"

  # 서버 멤버에 추가
  await servers_col.update_one(
      {"_id": server_id},
      {"$addToSet": {"members": member}},
  )

  # 채널 멤버에도 추가 (지정된 channel_ids 또는 모든 채널)
  categories = server_doc.get("categories", [])
  target_channel_ids = payload.channel_ids or [
      ch.get("id") for cat in categories for ch in cat.get("channels", [])
  ]

  if target_channel_ids:
    for cat in categories:
      for ch in cat.get("channels", []):
        if ch.get("id") in target_channel_ids:
          members = ch.get("members", [])
          if not any(m.get("id") == member["id"] for m in members):
            members.append(member)
          ch["members"] = members

    await servers_col.update_one(
        {"_id": server_id},
        {"$set": {"categories": categories}},
    )

    # 소켓 이벤트로 각 채널에 멤버 추가 알림
    for ch_id in target_channel_ids:
      await sio.emit(
          "member_joined",
          {"channelId": ch_id, "member": member},
          room=ch_id,
      )

  # 최신 서버 반환
  updated_server = await servers_col.find_one({"_id": server_id})
  return _server_doc_to_model(updated_server)


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
  if payload.sender and payload.sender.id:
    # 서버 멤버가 아닌 경우 차단
    server_doc = await servers_col.find_one({"_id": server.id, "members.id": payload.sender.id})
    if not server_doc:
      raise HTTPException(status_code=403, detail="Not a member of this server")

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

  print(f"[backend] message saved (REST) channel={channel_id}, id={message.id}, sender={sender.name}")

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message)},
      room=channel_id,
  )
  return message


# -----------------------------
# 채널 멤버 API
# -----------------------------
@fastapi_app.get(
    "/channels/{channel_id}/members",
    response_model=List[ChannelMember],
)
async def get_channel_members(channel_id: str):
  server_doc = await servers_col.find_one({"categories.channels.id": channel_id})
  if not server_doc:
    raise HTTPException(status_code=404, detail="Channel not found")

  # Find the channel and get its members
  for category in server_doc.get("categories", []):
    for channel in category.get("channels", []):
      if channel["id"] == channel_id:
        members = channel.get("members", [])
        return [ChannelMember(**m) for m in members]

  raise HTTPException(status_code=404, detail="Channel not found")


@fastapi_app.post(
    "/channels/{channel_id}/members",
    response_model=ChannelMember,
    status_code=201,
)
async def add_channel_member(channel_id: str, member: ChannelMember):
  # Find the server containing this channel
  server_doc = await servers_col.find_one({"categories.channels.id": channel_id})
  if not server_doc:
    raise HTTPException(status_code=404, detail="Channel not found")

  # Check if member already exists
  for category in server_doc.get("categories", []):
    for channel in category.get("channels", []):
      if channel["id"] == channel_id:
        existing_members = channel.get("members", [])
        if any(m["id"] == member.id for m in existing_members):
          raise HTTPException(status_code=400, detail="Member already exists in channel")

  # Add member to channel
  result = await servers_col.update_one(
      {"categories.channels.id": channel_id},
      {"$push": {"categories.$[].channels.$[ch].members": member.model_dump()}},
      array_filters=[{"ch.id": channel_id}],
  )

  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="Channel not found")

  # Emit Socket.IO event for real-time update
  await sio.emit(
      "member_joined",
      {"channelId": channel_id, "member": member.model_dump()},
      room=channel_id,
  )

  return member


@fastapi_app.delete(
    "/channels/{channel_id}/members/{user_id}",
    status_code=204,
)
async def remove_channel_member(channel_id: str, user_id: str):
  result = await servers_col.update_one(
      {"categories.channels.id": channel_id},
      {"$pull": {"categories.$[].channels.$[ch].members": {"id": user_id}}},
      array_filters=[{"ch.id": channel_id}],
  )

  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="Channel or member not found")

  # Emit Socket.IO event for real-time update
  await sio.emit(
      "member_left",
      {"channelId": channel_id, "userId": user_id},
      room=channel_id,
  )

  return None


# -----------------------------
# Socket.IO 이벤트
# -----------------------------

# 온라인 사용자 추적 (세션 ID -> 사용자 ID 매핑)
online_users = {}
user_cache: Dict[str, Dict] = {}


async def _get_member_summary(user_id: str) -> Dict:
  # 캐시 우선
  if user_id in user_cache:
    return user_cache[user_id]

  user_doc = await users_col.find_one({"_id": user_id})
  if user_doc:
    summary = {
        "id": user_doc["_id"],
        "name": user_doc["name"],
        "avatar": user_doc.get("avatar") or user_doc["name"][:1],
        "status": "online",
    }
  else:
    summary = {
        "id": user_id,
        "name": user_id,
        "avatar": user_id[:1] if user_id else "U",
        "status": "online",
    }
  user_cache[user_id] = summary
  return summary


@sio.event
async def connect(sid, environ):
  await sio.save_session(sid, {"channels": [], "user_id": None})


@sio.event
async def disconnect(sid):
  # 사용자의 온라인 상태 업데이트
  if sid in online_users:
    user_id = online_users[sid]
    del online_users[sid]

    # 사용자가 속한 모든 채널에 오프라인 상태 브로드캐스트
    session = await sio.get_session(sid)
    channels = session.get("channels", [])
    for channel_id in channels:
      await sio.emit(
          "member_left",
          {"userId": user_id, "channelId": channel_id},
          room=channel_id,
      )

  await sio.save_session(sid, {"channels": [], "user_id": None})


@sio.event
async def join(sid, data):
  channel_id = data.get("channelId") or data.get("channel_id")
  user_id = data.get("userId") or data.get("user_id")

  server, category, channel = await _ensure_channel(channel_id)
  if not channel:
    return False

  await sio.enter_room(sid, channel_id)
  session = await sio.get_session(sid)
  channels = set(session.get("channels", []))
  channels.add(channel_id)

  # 사용자 ID 저장
  if user_id:
    online_users[sid] = user_id
    await sio.save_session(sid, {"channels": list(channels), "user_id": user_id})

    # 채널 멤버 목록에 추가 (중복 없이)
    member = await _get_member_summary(user_id)
    await servers_col.update_one(
        {"categories.channels.id": channel_id},
        {"$addToSet": {"categories.$[].channels.$[ch].members": member}},
        array_filters=[{"ch.id": channel_id}],
    )

    # 채널에 온라인 상태 브로드캐스트
    await sio.emit(
        "member_joined",
        {"channelId": channel_id, "member": member},
        room=channel_id,
    )
  else:
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
  user_id = online_users.get(sid)
  if user_id:
    await sio.emit("member_left", {"channelId": channel_id, "userId": user_id}, room=channel_id)
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

  print(f"[backend] message saved (socket) channel={channel_id}, id={message_obj.id}, sender={message_obj.sender.name}")

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message_obj)},
      room=channel_id,
      skip_sid=sid,  # 보낸 클라이언트를 제외하고 다른 참가자에게만 전송
  )
  return True


# uvicorn entrypoint expects `app`
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

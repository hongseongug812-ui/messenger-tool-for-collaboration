import os
import uuid
import mimetypes
import aiofiles
import base64
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import socketio
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _get_list_env(key: str, default: List[str]) -> List[str]:
  raw = os.getenv(key)
  if not raw:
    return default
  return [item.strip() for item in raw.split(",") if item.strip()]


def _now():
  return datetime.now(timezone.utc)


# 암호화/복호화 함수
def encrypt_text(text: str) -> str:
  """텍스트를 암호화하여 base64 문자열로 반환"""
  if not text:
    return text
  encrypted = fernet.encrypt(text.encode())
  return base64.urlsafe_b64encode(encrypted).decode()


def decrypt_text(encrypted_text: str) -> str:
  """암호화된 base64 문자열을 복호화"""
  if not encrypted_text:
    return encrypted_text
  try:
    encrypted = base64.urlsafe_b64decode(encrypted_text.encode())
    decrypted = fernet.decrypt(encrypted)
    return decrypted.decode()
  except Exception as e:
    print(f"[decrypt_text] 복호화 실패: {e}")
    return encrypted_text  # 복호화 실패 시 원본 반환


def extract_mentions(content: str) -> List[str]:
  """메시지에서 @username 형식의 멘션 추출"""
  return re.findall(r'@(\w+)', content)


async def create_notification(user_id: str, notif_type: str, message_id: str, channel_id: str, content: str, trigger: str):
  """알림 생성 및 저장"""
  notification = {
    "_id": f"notif_{uuid.uuid4().hex[:12]}",
    "user_id": user_id,
    "type": notif_type,
    "message_id": message_id,
    "channel_id": channel_id,
    "content": content[:100],  # 메시지 내용 일부만 저장
    "trigger": trigger,
    "read": False,
    "created_at": _now()
  }
  await notifications_col.insert_one(notification)
  return notification["_id"]


async def process_mentions_and_keywords(message_id: str, channel_id: str, content: str, sender_id: str):
  """멘션 및 키워드 알림 처리"""
  # 멘션 처리
  mentions = extract_mentions(content)
  for username in mentions:
    # 멘션된 사용자 찾기
    user_doc = await users_col.find_one({"username": username})
    if user_doc and user_doc["_id"] != sender_id:  # 자기 자신은 제외
      await create_notification(
        user_id=user_doc["_id"],
        notif_type="mention",
        message_id=message_id,
        channel_id=channel_id,
        content=content,
        trigger=f"@{username}"
      )

  # 키워드 알림 처리
  users_cursor = users_col.find({"notification_keywords": {"$exists": True, "$ne": []}})
  async for user_doc in users_cursor:
    if user_doc["_id"] == sender_id:  # 자기 메시지는 제외
      continue
    keywords = user_doc.get("notification_keywords", [])
    for keyword in keywords:
      if keyword.lower() in content.lower():
        await create_notification(
          user_id=user_doc["_id"],
          notif_type="keyword",
          message_id=message_id,
          channel_id=channel_id,
          content=content,
          trigger=keyword
        )
        break  # 사용자당 하나의 키워드 알림만


# 환경 변수
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "work_messenger")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7일

# 암호화 설정
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "default-encryption-key-change-in-production-32bytes")
# 암호화 키를 32바이트로 맞추기
if len(ENCRYPTION_KEY.encode()) < 32:
    ENCRYPTION_KEY = ENCRYPTION_KEY.ljust(32, '0')
elif len(ENCRYPTION_KEY.encode()) > 32:
    ENCRYPTION_KEY = ENCRYPTION_KEY[:32]

# Fernet 암호화 객체 생성
kdf = PBKDF2HMAC(
    algorithm=hashes.SHA256(),
    length=32,
    salt=b'work_messenger_salt',  # 프로덕션에서는 랜덤 salt 사용
    iterations=100000,
)
encryption_key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
fernet = Fernet(encryption_key)

cors_origins = _get_list_env(
    "BACKEND_CORS_ORIGINS",
    ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"],
)

# 파일 업로드 설정
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)  # uploads 폴더 생성
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# DB 클라이언트
mongo_client = AsyncIOMotorClient(MONGO_URI)
mongo_db = mongo_client[MONGO_DB]
servers_col = mongo_db["servers"]
messages_col = mongo_db["messages"]
users_col = mongo_db["users"]
notifications_col = mongo_db["notifications"]

# 비밀번호 해싱 및 인증 스킴 (bcrypt 72바이트 제한 회피를 위해 bcrypt_sha256 사용)
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")
security = HTTPBearer()

# Socket.IO 서버 (ASGI)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",  # 모든 origin 허용 (디버깅용)
    allow_upgrades=True,
    logger=True,  # Socket.IO 로깅 활성화
    engineio_logger=True,  # Engine.IO 로깅 활성화
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
  notification_keywords: List[str] = Field(default_factory=list)  # 알림 키워드
  deleted_at: Optional[datetime] = None  # 계정 탈퇴 시간


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
  role: str = "member"  # owner, admin, moderator, member


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


class ServerMember(BaseModel):
  id: str
  name: str
  avatar: str
  status: str = "offline"
  role: str = "member"  # owner, admin, moderator, member
  nickname: Optional[str] = None  # 서버별 닉네임

class Server(BaseModel):
  id: str
  name: str
  avatar: str = "S"
  categories: List[Category] = Field(default_factory=list)
  members: List[ServerMember] = Field(default_factory=list)
  created_at: datetime


class ServerCreate(BaseModel):
  name: str = Field(..., min_length=1, max_length=80)
  avatar: Optional[str] = Field(default=None, max_length=2)


class InviteRequest(BaseModel):
  user_id: Optional[str] = None
  username: Optional[str] = None
  email: Optional[str] = None
  channel_ids: Optional[List[str]] = None
  role: str = "member"  # 초대 시 부여할 역할


class RoleUpdateRequest(BaseModel):
  user_id: str
  role: str = Field(..., pattern="^(owner|admin|moderator|member)$")


class NicknameUpdateRequest(BaseModel):
  nickname: Optional[str] = Field(default=None, max_length=32)


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


class Notification(BaseModel):
  id: str
  user_id: str  # 알림을 받을 사용자
  type: str  # "mention", "keyword"
  message_id: str
  channel_id: str
  content: str  # 메시지 내용 일부
  trigger: str  # 멘션된 이름 또는 키워드
  read: bool = False
  created_at: datetime


class NotificationList(BaseModel):
  notifications: List[Notification]


class KeywordUpdate(BaseModel):
  keywords: List[str] = Field(..., max_items=20)


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
    notification_keywords=user_doc.get("notification_keywords", []),
    deleted_at=user_doc.get("deleted_at"),
  )

def _server_doc_to_model(doc: Dict) -> Server:
  return Server(
      id=doc["_id"],
      name=doc["name"],
      avatar=doc.get("avatar") or doc["name"][:1],
      categories=[Category(**cat) for cat in doc.get("categories", [])],
      members=[ServerMember(**m) for m in doc.get("members", [])],
      created_at=doc.get("created_at", _now()),
  )


# 권한 체크 함수
async def _check_permission(server_id: str, user_id: str, required_roles: List[str]) -> bool:
  """서버에서 사용자의 역할이 required_roles에 포함되는지 확인"""
  server_doc = await servers_col.find_one({"_id": server_id})
  if not server_doc:
    return False

  members = server_doc.get("members", [])
  user_member = next((m for m in members if m.get("id") == user_id), None)

  if not user_member:
    return False

  user_role = user_member.get("role", "member")
  return user_role in required_roles


async def _get_user_role(server_id: str, user_id: str) -> Optional[str]:
  """서버에서 사용자의 역할 가져오기"""
  server_doc = await servers_col.find_one({"_id": server_id})
  if not server_doc:
    return None

  members = server_doc.get("members", [])
  user_member = next((m for m in members if m.get("id") == user_id), None)

  return user_member.get("role") if user_member else None


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


# 키워드 알림 관리
@fastapi_app.get("/auth/me/keywords")
async def get_keywords(current_user: User = Depends(get_current_user)):
  user_doc = await users_col.find_one({"_id": current_user.id})
  keywords = user_doc.get("notification_keywords", []) if user_doc else []
  return {"keywords": keywords}


@fastapi_app.put("/auth/me/keywords")
async def update_keywords(payload: KeywordUpdate, current_user: User = Depends(get_current_user)):
  await users_col.update_one(
    {"_id": current_user.id},
    {"$set": {"notification_keywords": payload.keywords}}
  )
  return {"keywords": payload.keywords}


# 계정 탈퇴 (소프트 삭제 - 3개월 후 완전 삭제)
@fastapi_app.delete("/auth/account", status_code=204)
async def delete_account(current_user: User = Depends(get_current_user)):
  await users_col.update_one(
    {"_id": current_user.id},
    {"$set": {"deleted_at": _now()}}
  )
  return None


# -----------------------------
# 알림 API
# -----------------------------
@fastapi_app.get("/notifications", response_model=NotificationList)
async def get_notifications(current_user: User = Depends(get_current_user), unread_only: bool = False):
  query = {"user_id": current_user.id}
  if unread_only:
    query["read"] = False

  cursor = notifications_col.find(query).sort("created_at", -1).limit(50)
  notifications = []
  async for doc in cursor:
    notifications.append(
      Notification(
        id=doc["_id"],
        user_id=doc["user_id"],
        type=doc["type"],
        message_id=doc["message_id"],
        channel_id=doc["channel_id"],
        content=doc["content"],
        trigger=doc["trigger"],
        read=doc["read"],
        created_at=doc["created_at"]
      )
    )
  return {"notifications": notifications}


@fastapi_app.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: User = Depends(get_current_user)):
  result = await notifications_col.update_one(
    {"_id": notification_id, "user_id": current_user.id},
    {"$set": {"read": True}}
  )
  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="Notification not found")
  return {"status": "ok"}


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

  # 서버 생성자를 owner로 설정
  owner_member = {
      "id": current_user.id,
      "name": current_user.name,
      "avatar": current_user.avatar or current_user.name[:1],
      "status": "online",
      "role": "owner",  # owner 역할 부여
  }

  # 기본 채널에 owner를 members로 추가
  default_category = Category(
      id=f"cat_{uuid.uuid4().hex[:8]}",
      name="텍스트 채널",
      channels=[
          Channel(
              id=f"channel_{uuid.uuid4().hex[:8]}",
              name="일반",
              type="text",
              members=[ChannelMember(**owner_member)],  # owner를 채널 멤버에 추가
          )
      ],
  )

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
  member["role"] = payload.role  # 초대 시 지정된 역할 부여

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
    # 암호화된 content 복호화
    decrypted_content = decrypt_text(doc["content"])
    messages.append(
        Message(
            id=doc["_id"],
            channel_id=doc["channel_id"],
            sender=Sender(**doc["sender"]),
            content=decrypted_content,
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

  # content 암호화 후 저장
  encrypted_content = encrypt_text(payload.content)
  await messages_col.insert_one(
      {
          "_id": message.id,
          "channel_id": channel_id,
          "sender": sender.model_dump(),
          "content": encrypted_content,
          "timestamp": message.timestamp,
          "files": [f.model_dump() for f in message.files],
      }
  )

  print(f"[backend] message saved (REST) channel={channel_id}, id={message.id}, sender={sender.name}")

  # 멘션 및 키워드 알림 처리 (암호화되지 않은 원본 content 사용)
  if sender.id:
    await process_mentions_and_keywords(message.id, channel_id, payload.content, sender.id)

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message)},
      room=channel_id,
  )
  return message


# -----------------------------
# 파일 업로드 API
# -----------------------------
@fastapi_app.post("/files/upload", response_model=FileAttachment)
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
  # 파일 크기 검사
  content = await file.read()
  if len(content) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB")

  # 파일 ID 생성
  file_id = f"file_{uuid.uuid4().hex[:12]}"

  # 파일 확장자 추출
  file_extension = ""
  if file.filename and "." in file.filename:
    file_extension = file.filename.split(".")[-1]

  # 저장 파일명
  saved_filename = f"{file_id}.{file_extension}" if file_extension else file_id
  file_path = UPLOAD_DIR / saved_filename

  # 파일 저장
  async with aiofiles.open(file_path, 'wb') as f:
    await f.write(content)

  # MIME 타입 감지
  mime_type = file.content_type
  if not mime_type:
    mime_type, _ = mimetypes.guess_type(file.filename or "")
    mime_type = mime_type or "application/octet-stream"

  file_attachment = FileAttachment(
      id=file_id,
      name=file.filename or saved_filename,
      size=len(content),
      type=mime_type,
      url=f"/files/{file_id}"
  )

  return file_attachment


@fastapi_app.get("/files/{file_id}")
async def get_file(file_id: str):
  # uploads 폴더에서 file_id로 시작하는 파일 찾기
  matching_files = list(UPLOAD_DIR.glob(f"{file_id}.*"))
  if not matching_files:
    # 확장자 없는 파일 찾기
    file_path = UPLOAD_DIR / file_id
    if not file_path.exists():
      raise HTTPException(status_code=404, detail="File not found")
  else:
    file_path = matching_files[0]

  # MIME 타입 추측
  mime_type, _ = mimetypes.guess_type(str(file_path))
  if not mime_type:
    mime_type = "application/octet-stream"

  return FileResponse(file_path, media_type=mime_type)


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
# 역할 관리 API
# -----------------------------
@fastapi_app.patch("/servers/{server_id}/members/{user_id}/role", response_model=ServerMember)
async def update_member_role(
    server_id: str,
    user_id: str,
    payload: RoleUpdateRequest,
    current_user: User = Depends(get_current_user)
):
  # 권한 확인: owner와 admin만 역할 변경 가능
  has_permission = await _check_permission(server_id, current_user.id, ["owner", "admin"])
  if not has_permission:
    raise HTTPException(status_code=403, detail="권한이 없습니다. owner 또는 admin만 역할을 변경할 수 있습니다.")

  # owner는 다른 owner로만 역할 변경 가능 (owner 이전)
  target_role = await _get_user_role(server_id, user_id)
  current_role = await _get_user_role(server_id, current_user.id)

  if target_role == "owner" and current_role != "owner":
    raise HTTPException(status_code=403, detail="owner의 역할은 다른 owner만 변경할 수 있습니다.")

  # 자기 자신의 역할 변경 방지 (owner 이전 제외)
  if user_id == current_user.id and payload.role != "owner":
    raise HTTPException(status_code=400, detail="자신의 역할은 변경할 수 없습니다.")

  # 역할 업데이트
  result = await servers_col.update_one(
      {"_id": server_id, "members.id": user_id},
      {"$set": {"members.$.role": payload.role}}
  )

  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="서버 또는 멤버를 찾을 수 없습니다.")

  # 업데이트된 멤버 정보 반환
  server_doc = await servers_col.find_one({"_id": server_id})
  members = server_doc.get("members", [])
  updated_member = next((m for m in members if m.get("id") == user_id), None)

  if not updated_member:
    raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다.")

  return ServerMember(**updated_member)


@fastapi_app.patch("/servers/{server_id}/members/me/nickname", response_model=ServerMember)
async def update_my_nickname(
    server_id: str,
    payload: NicknameUpdateRequest,
    current_user: User = Depends(get_current_user)
):
  """현재 사용자의 서버별 닉네임 업데이트"""
  # 서버 멤버인지 확인
  server_doc = await servers_col.find_one({"_id": server_id})
  if not server_doc:
    raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")

  members = server_doc.get("members", [])
  is_member = any(m.get("id") == current_user.id for m in members)

  if not is_member:
    raise HTTPException(status_code=403, detail="이 서버의 멤버가 아닙니다.")

  # 닉네임 업데이트
  result = await servers_col.update_one(
      {"_id": server_id, "members.id": current_user.id},
      {"$set": {"members.$.nickname": payload.nickname}}
  )

  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다.")

  # 업데이트된 멤버 정보 반환
  server_doc = await servers_col.find_one({"_id": server_id})
  members = server_doc.get("members", [])
  updated_member = next((m for m in members if m.get("id") == current_user.id), None)

  if not updated_member:
    raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다.")

  return ServerMember(**updated_member)


@fastapi_app.delete("/servers/{server_id}/members/{user_id}", status_code=204)
async def kick_member(
    server_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
  # 권한 확인: owner, admin, moderator만 추방 가능
  has_permission = await _check_permission(server_id, current_user.id, ["owner", "admin", "moderator"])
  if not has_permission:
    raise HTTPException(status_code=403, detail="권한이 없습니다.")

  # owner는 추방할 수 없음
  target_role = await _get_user_role(server_id, user_id)
  if target_role == "owner":
    raise HTTPException(status_code=403, detail="서버 소유자는 추방할 수 없습니다.")

  # 자기 자신 추방 방지
  if user_id == current_user.id:
    raise HTTPException(status_code=400, detail="자신을 추방할 수 없습니다.")

  # 서버에서 멤버 제거
  result = await servers_col.update_one(
      {"_id": server_id},
      {"$pull": {"members": {"id": user_id}}}
  )

  if result.modified_count == 0:
    raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다.")

  # 모든 채널에서도 제거
  server_doc = await servers_col.find_one({"_id": server_id})
  categories = server_doc.get("categories", [])

  for cat in categories:
    for ch in cat.get("channels", []):
      members = ch.get("members", [])
      ch["members"] = [m for m in members if m.get("id") != user_id]

  await servers_col.update_one(
      {"_id": server_id},
      {"$set": {"categories": categories}}
  )

  return None


# -----------------------------
# 검색 API
# -----------------------------
class SearchResults(BaseModel):
  users: List[User] = Field(default_factory=list)
  messages: List[Message] = Field(default_factory=list)


@fastapi_app.get("/search", response_model=SearchResults)
async def search(
    q: str = "",
    type: str = "all",  # all, users, messages
    server_id: Optional[str] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
  """전체 검색: 사용자, 메시지"""
  if not q or len(q) < 2:
    return SearchResults()

  results = SearchResults()

  # 사용자 검색
  if type in ["all", "users"]:
    user_query = {
        "$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"username": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}}
        ]
    }
    user_cursor = users_col.find(user_query).limit(limit)
    async for user_doc in user_cursor:
      results.users.append(User(
          id=user_doc["_id"],
          username=user_doc["username"],
          name=user_doc["name"],
          email=user_doc["email"],
          avatar=user_doc.get("avatar", user_doc["name"][:1]),
          created_at=user_doc["created_at"]
      ))

  # 메시지 검색
  if type in ["all", "messages"]:
    message_query = {"content": {"$regex": q, "$options": "i"}}

    # 특정 서버 내에서만 검색
    if server_id:
      server_doc = await servers_col.find_one({"_id": server_id})
      if server_doc:
        channel_ids = [
            ch.get("id")
            for cat in server_doc.get("categories", [])
            for ch in cat.get("channels", [])
        ]
        message_query["channel_id"] = {"$in": channel_ids}

    message_cursor = messages_col.find(message_query).sort("timestamp", -1).limit(limit)
    async for msg_doc in message_cursor:
      results.messages.append(Message(
          id=msg_doc["_id"],
          channel_id=msg_doc["channel_id"],
          sender=Sender(**msg_doc["sender"]),
          content=msg_doc["content"],
          timestamp=msg_doc["timestamp"],
          files=[FileAttachment(**f) for f in msg_doc.get("files", [])]
      ))

  return results


@fastapi_app.get("/servers/{server_id}/search", response_model=SearchResults)
async def search_in_server(
    server_id: str,
    q: str = "",
    type: str = "all",
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
  """서버 내 검색"""
  # 서버 멤버 확인
  server_doc = await servers_col.find_one({"_id": server_id, "members.id": current_user.id})
  if not server_doc:
    raise HTTPException(status_code=403, detail="서버에 접근 권한이 없습니다.")

  return await search(q=q, type=type, server_id=server_id, limit=limit, current_user=current_user)


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
  print(f"[backend] Socket.IO client connected: {sid}")
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

  # content 암호화 후 저장
  encrypted_content = encrypt_text(content)
  await messages_col.insert_one(
      {
          "_id": message_obj.id,
          "channel_id": channel_id,
          "sender": message_obj.sender.model_dump(),
          "content": encrypted_content,
          "timestamp": message_obj.timestamp,
          "files": [f.model_dump() for f in message_obj.files],
      }
  )

  print(f"[backend] message saved (socket) channel={channel_id}, id={message_obj.id}, sender={message_obj.sender.name}")

  # 멘션 및 키워드 알림 처리 (암호화되지 않은 원본 content 사용)
  if message_obj.sender.id:
    await process_mentions_and_keywords(message_obj.id, channel_id, content, message_obj.sender.id)

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message_obj)},
      room=channel_id,
      skip_sid=sid,  # 보낸 클라이언트를 제외하고 다른 참가자에게만 전송
  )
  return True


# uvicorn entrypoint expects `app`
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

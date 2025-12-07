import os
import uuid
import mimetypes
import aiofiles
import base64
import re
import io
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import socketio
import pyotp
import qrcode
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from openai import OpenAI


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


async def send_email(to_email: str, subject: str, body: str):
  """이메일 발송 유틸리티"""
  if not SMTP_USER or not SMTP_PASSWORD:
    print("[send_email] SMTP 설정이 없습니다. 이메일을 발송하지 않습니다.")
    return False

  try:
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = to_email

    html_part = MIMEText(body, "html")
    message.attach(html_part)

    await aiosmtplib.send(
      message,
      hostname=SMTP_HOST,
      port=SMTP_PORT,
      username=SMTP_USER,
      password=SMTP_PASSWORD,
      start_tls=True
    )
    print(f"[send_email] 이메일 발송 성공: {to_email}")
    return True
  except Exception as e:
    print(f"[send_email] 이메일 발송 실패: {e}")
    return False


async def create_password_reset_token(user_id: str, email: str) -> str:
  """비밀번호 재설정 토큰 생성"""
  token = secrets.token_urlsafe(32)
  expires_at = _now() + timedelta(hours=1)  # 1시간 유효

  await password_reset_tokens_col.insert_one({
    "_id": token,
    "user_id": user_id,
    "email": email,
    "created_at": _now(),
    "expires_at": expires_at,
    "used": False
  })

  return token


async def verify_password_reset_token(token: str) -> Optional[Dict]:
  """비밀번호 재설정 토큰 검증"""
  token_doc = await password_reset_tokens_col.find_one({"_id": token})

  if not token_doc:
    return None

  if token_doc.get("used"):
    return None

  if token_doc["expires_at"] < _now():
    return None

  return token_doc


async def mark_token_as_used(token: str):
  """토큰을 사용 완료로 표시"""
  await password_reset_tokens_col.update_one(
    {"_id": token},
    {"$set": {"used": True, "used_at": _now()}}
  )


async def record_login_session(user_id: str, ip_address: str, user_agent: str):
  """로그인 세션 기록"""
  session = {
    "_id": f"session_{uuid.uuid4().hex[:12]}",
    "user_id": user_id,
    "ip_address": ip_address,
    "user_agent": user_agent,
    "timestamp": _now()
  }

  await login_sessions_col.insert_one(session)

  # 새로운 기기/위치 감지 (최근 30일 이내 같은 IP로 로그인한 적이 없는 경우)
  thirty_days_ago = _now() - timedelta(days=30)
  existing_session = await login_sessions_col.find_one({
    "user_id": user_id,
    "ip_address": ip_address,
    "timestamp": {"$gte": thirty_days_ago}
  })

  # 새로운 기기로 로그인하는 경우 이메일 알림 발송
  is_new_device = existing_session is None
  if is_new_device:
    user_doc = await users_col.find_one({"_id": user_id})
    if user_doc:
      await send_email(
        to_email=user_doc["email"],
        subject="새로운 기기에서 로그인",
        body=f"""
        <html>
          <body>
            <h2>새로운 기기에서 로그인이 감지되었습니다</h2>
            <p>안녕하세요 {user_doc['name']}님,</p>
            <p>귀하의 계정에 새로운 기기에서 로그인이 감지되었습니다:</p>
            <ul>
              <li>IP 주소: {ip_address}</li>
              <li>사용자 에이전트: {user_agent}</li>
              <li>로그인 시간: {_now().strftime('%Y-%m-%d %H:%M:%S')}</li>
            </ul>
            <p>본인의 로그인이 아닌 경우, 즉시 비밀번호를 변경해주세요.</p>
          </body>
        </html>
        """
      )

  return is_new_device


# 환경 변수
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "work_messenger")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7일

# SMTP 설정 (이메일 발송용)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)

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
audit_logs_col = mongo_db["audit_logs"]
dm_channels_col = mongo_db["dm_channels"]  # DM and group DM channels
user_channel_reads_col = mongo_db["user_channel_reads"]  # Track last read timestamps
notification_settings_col = mongo_db["notification_settings"]  # Notification preferences
password_reset_tokens_col = mongo_db["password_reset_tokens"]  # 비밀번호 재설정 토큰
login_sessions_col = mongo_db["login_sessions"]  # 로그인 세션 기록
bookmarks_col = mongo_db["bookmarks"]  # 사용자별 북마크(저장한 메시지)

# 비밀번호 해싱 및 인증 스킴 (bcrypt 72바이트 제한 회피를 위해 bcrypt_sha256 사용)
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")
security = HTTPBearer()

# OpenAI 클라이언트
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY")) if os.getenv("OPENAI_API_KEY") else None

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

  # 조직 정보 (업무용 메신저 핵심)
  job_title: Optional[str] = None  # 직책 (주임, 대리, 과장 등)
  department: Optional[str] = None  # 부서
  extension: Optional[str] = None  # 내선번호
  phone: Optional[str] = None  # 회사 번호
  location: Optional[str] = None  # 근무지 (본사/지점/재택 등)

  # 보안 설정 (2FA)
  totp_enabled: bool = False  # 2FA 활성화 여부
  totp_secret: Optional[str] = None  # TOTP 시크릿 (암호화 저장)


class UserInDB(User):
  hashed_password: str


class UserProfileUpdate(BaseModel):
  """프로필 업데이트 모델 (업무용 정보 포함)"""
  name: Optional[str] = None
  email: Optional[EmailStr] = None
  job_title: Optional[str] = None  # 직책
  department: Optional[str] = None  # 부서
  extension: Optional[str] = None  # 내선번호
  phone: Optional[str] = None  # 회사 번호
  location: Optional[str] = None  # 근무지
  notification_keywords: Optional[List[str]] = None  # 알림 키워드


class Token(BaseModel):
  access_token: str
  token_type: str


class TokenData(BaseModel):
  username: Optional[str] = None


class AuthResponse(BaseModel):
  access_token: str
  token_type: str
  user: User
  requires_2fa: bool = False  # 2FA 인증이 필요한 경우


# 보안 관련 모델
class PasswordResetRequest(BaseModel):
  """비밀번호 재설정 요청"""
  email: EmailStr


class PasswordResetConfirm(BaseModel):
  """비밀번호 재설정 확인"""
  token: str
  new_password: str = Field(..., min_length=6, max_length=72)


class TwoFactorSetup(BaseModel):
  """2FA 설정 응답"""
  secret: str
  qr_code_url: str


class TwoFactorVerify(BaseModel):
  """2FA 코드 검증"""
  code: str = Field(..., min_length=6, max_length=6)


class TwoFactorLogin(BaseModel):
  """2FA 로그인"""
  username: str
  password: str
  totp_code: Optional[str] = None


class LoginSession(BaseModel):
  """로그인 세션 기록"""
  user_id: str
  ip_address: Optional[str] = None
  user_agent: Optional[str] = None
  location: Optional[str] = None
  timestamp: datetime


class BookmarkCreate(BaseModel):
  """북마크 생성 요청"""
  message_id: str


class Bookmark(BaseModel):
  """북마크(저장한 메시지)"""
  id: str
  user_id: str
  message_id: str
  server_id: Optional[str] = None
  channel_id: str
  created_at: datetime


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
  type: str = "text"  # "text" | "dm" | "group_dm"
  unread: int = 0
  members: List[ChannelMember] = Field(default_factory=list)
  server_id: Optional[str] = None  # None for DM channels
  participants: List[str] = Field(default_factory=list)  # User IDs for DM channels
  # Permission fields
  is_private: bool = False  # If true, only allowed_roles/allowed_members can access
  allowed_roles: List[str] = Field(default_factory=list)  # Roles that can access (e.g., ["admin", "moderator"])
  allowed_members: List[str] = Field(default_factory=list)  # Specific user IDs that can access
  post_permission: str = "everyone"  # "everyone" | "admin_only" | "owner_only"


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
  is_private: bool = False
  allowed_roles: List[str] = Field(default_factory=list)
  allowed_members: List[str] = Field(default_factory=list)
  post_permission: str = "everyone"  # "everyone" | "admin_only" | "owner_only"


class ChannelUpdate(BaseModel):
  name: Optional[str] = Field(default=None, min_length=1, max_length=80)
  is_private: Optional[bool] = None
  allowed_roles: Optional[List[str]] = None
  allowed_members: Optional[List[str]] = None
  post_permission: Optional[str] = None


class DMCreate(BaseModel):
  participants: List[str] = Field(..., min_items=1, max_items=10)  # User IDs (for 1:1 DM, length=1; for group DM, length>1)
  name: Optional[str] = Field(default=None, max_length=80)  # Optional name for group DMs


class Message(BaseModel):
  id: str
  channel_id: str
  sender: Sender
  content: str
  timestamp: datetime
  files: List[FileAttachment] = Field(default_factory=list)
  thread_id: Optional[str] = None  # 답글인 경우 원본 메시지 ID
  reply_count: int = 0  # 이 메시지에 달린 답글 수
  edited_at: Optional[datetime] = None  # 수정된 시간
  is_deleted: bool = False  # 삭제 여부


class MessageCreate(BaseModel):
  sender: Sender
  content: str = Field("", max_length=4000)
  files: List[FileAttachment] = Field(default_factory=list)
  thread_id: Optional[str] = None  # 답글인 경우 원본 메시지 ID


class AuditLog(BaseModel):
  id: str
  action: str  # "edit_message", "delete_message"
  user_id: str
  user_name: str
  target_id: str  # message_id
  target_type: str  # "message"
  old_content: Optional[str] = None
  new_content: Optional[str] = None
  timestamp: datetime
  channel_id: str
  server_id: str


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


class SearchQuery(BaseModel):
  query: str = Field(..., min_length=1, max_length=200)
  author: Optional[str] = None  # Filter by username or user ID
  channel_id: Optional[str] = None  # Filter by channel
  server_id: Optional[str] = None  # Filter by server
  from_date: Optional[datetime] = None  # From date
  to_date: Optional[datetime] = None  # To date
  my_messages_only: bool = False  # Only search user's own messages
  limit: int = Field(default=50, ge=1, le=100)
  offset: int = Field(default=0, ge=0)


class MessageSearchResult(BaseModel):
  message: Message
  server_id: Optional[str] = None
  server_name: Optional[str] = None
  channel_name: str
  highlight: str  # Highlighted snippet


class SearchMessagesResponse(BaseModel):
  results: List[MessageSearchResult]
  total: int
  query: str


class FileSearchResult(BaseModel):
  file: FileAttachment
  message_id: str
  channel_id: str
  channel_name: str
  server_id: Optional[str] = None
  server_name: Optional[str] = None
  sender: Sender
  timestamp: datetime


class SearchFilesResponse(BaseModel):
  results: List[FileSearchResult]
  total: int
  query: str


class NotificationLevel(str):
  """알림 레벨"""
  ALL = "all"  # 모든 메시지
  MENTIONS = "mentions"  # 멘션만
  NOTHING = "nothing"  # 알림 없음


class ChannelNotificationSettings(BaseModel):
  channel_id: str
  level: str = "all"  # "all" | "mentions" | "nothing"


class ServerNotificationSettings(BaseModel):
  server_id: str
  muted: bool = False  # 서버 전체 음소거


class NotificationSettings(BaseModel):
  user_id: str
  channels: List[ChannelNotificationSettings] = Field(default_factory=list)
  servers: List[ServerNotificationSettings] = Field(default_factory=list)
  desktop_enabled: bool = True
  sound_enabled: bool = True


class MarkAsReadRequest(BaseModel):
  channel_id: str
  timestamp: Optional[datetime] = None  # None = mark all as read


class UnreadCount(BaseModel):
  channel_id: str
  count: int
  has_mention: bool = False


class UnreadCountsResponse(BaseModel):
  unreads: List[UnreadCount]


class MentionsResponse(BaseModel):
  mentions: List[Notification]
  total: int


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

def _server_doc_to_model(doc: Dict, filter_user_id: Optional[str] = None) -> Server:
  categories = doc.get("categories", [])

  # If filter_user_id is provided, filter channels based on permissions
  if filter_user_id:
    # Get user's role in this server
    members = doc.get("members", [])
    user_member = next((m for m in members if m.get("id") == filter_user_id), None)
    user_role = user_member.get("role", "member") if user_member else "member"

    # Filter channels in each category
    filtered_categories = []
    for cat_data in categories:
      cat = Category(**cat_data)
      # Filter channels user can access
      accessible_channels = [
        ch for ch in cat.channels
        if _can_access_channel(ch, filter_user_id, user_role)
      ]
      cat.channels = accessible_channels
      filtered_categories.append(cat)
    categories = [c.model_dump() for c in filtered_categories]

  return Server(
      id=doc["_id"],
      name=doc["name"],
      avatar=doc.get("avatar") or doc["name"][:1],
      categories=[Category(**cat) for cat in categories],
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


def _can_access_channel(channel: Channel, user_id: str, user_role: str) -> bool:
  """Check if a user can access a channel based on permissions"""
  # Public channels are accessible to everyone
  if not channel.is_private:
    return True

  # Check if user is in allowed_members list
  if user_id in channel.allowed_members:
    return True

  # Check if user's role is in allowed_roles list
  if user_role in channel.allowed_roles:
    return True

  # Owner and admin can access all channels
  if user_role in ["owner", "admin"]:
    return True

  return False


def _can_post_in_channel(channel: Channel, user_role: str) -> bool:
  """Check if a user can post messages in a channel"""
  if channel.post_permission == "everyone":
    return True
  elif channel.post_permission == "admin_only":
    return user_role in ["owner", "admin"]
  elif channel.post_permission == "owner_only":
    return user_role == "owner"
  return True  # Default to allowing


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
async def login(credentials: TwoFactorLogin, request: Request):
  user_doc = await users_col.find_one({"username": credentials.username})
  ensure_password_length(credentials.password)

  if not user_doc or not verify_password(credentials.password, user_doc.get("hashed_password", "")):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

  # 2FA 활성화 확인
  totp_enabled = user_doc.get("totp_enabled", False)
  if totp_enabled:
    # 2FA 코드 검증
    if not credentials.totp_code:
      # 2FA 코드가 필요함을 알림
      raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="2FA code required"
      )

    totp_secret = user_doc.get("totp_secret")
    if not totp_secret:
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="2FA configuration error")

    # TOTP 검증
    totp = pyotp.TOTP(totp_secret)
    if not totp.verify(credentials.totp_code):
      raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

  # 로그인 세션 기록
  ip_address = request.client.host if request.client else "unknown"
  user_agent = request.headers.get("user-agent", "unknown")
  await record_login_session(user_doc["_id"], ip_address, user_agent)

  access_token = create_access_token(data={"sub": credentials.username})
  user = User(
      id=user_doc["_id"],
      username=user_doc["username"],
      name=user_doc["name"],
      email=user_doc["email"],
      avatar=user_doc["avatar"],
      created_at=user_doc["created_at"],
      job_title=user_doc.get("job_title"),
      department=user_doc.get("department"),
      extension=user_doc.get("extension"),
      phone=user_doc.get("phone"),
      location=user_doc.get("location"),
      totp_enabled=user_doc.get("totp_enabled", False),
  )
  return AuthResponse(access_token=access_token, token_type="bearer", user=user)


@fastapi_app.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
  return current_user


@fastapi_app.put("/profile", response_model=User)
async def update_profile(profile_data: UserProfileUpdate, current_user: User = Depends(get_current_user)):
  """사용자 프로필 업데이트 (조직 정보 포함)"""
  update_fields = {}

  if profile_data.name is not None:
    update_fields["name"] = profile_data.name
  if profile_data.email is not None:
    update_fields["email"] = profile_data.email
  if profile_data.job_title is not None:
    update_fields["job_title"] = profile_data.job_title
  if profile_data.department is not None:
    update_fields["department"] = profile_data.department
  if profile_data.extension is not None:
    update_fields["extension"] = profile_data.extension
  if profile_data.phone is not None:
    update_fields["phone"] = profile_data.phone
  if profile_data.location is not None:
    update_fields["location"] = profile_data.location
  if profile_data.notification_keywords is not None:
    update_fields["notification_keywords"] = profile_data.notification_keywords

  if update_fields:
    await users_col.update_one(
      {"_id": current_user.id},
      {"$set": update_fields}
    )

  # 업데이트된 사용자 정보 반환
  updated_user_doc = await users_col.find_one({"_id": current_user.id})
  return User(
    id=updated_user_doc["_id"],
    username=updated_user_doc["username"],
    name=updated_user_doc["name"],
    email=updated_user_doc["email"],
    avatar=updated_user_doc["avatar"],
    created_at=updated_user_doc["created_at"],
    job_title=updated_user_doc.get("job_title"),
    department=updated_user_doc.get("department"),
    extension=updated_user_doc.get("extension"),
    phone=updated_user_doc.get("phone"),
    location=updated_user_doc.get("location"),
    notification_keywords=updated_user_doc.get("notification_keywords", []),
  )


@fastapi_app.get("/users/{user_id}", response_model=User)
async def get_user_profile(user_id: str, current_user: User = Depends(get_current_user)):
  """다른 사용자의 프로필 조회 (업무용 정보 포함)"""
  user_doc = await users_col.find_one({"_id": user_id})
  if not user_doc:
    raise HTTPException(status_code=404, detail="User not found")

  return User(
    id=user_doc["_id"],
    username=user_doc["username"],
    name=user_doc["name"],
    email=user_doc["email"],
    avatar=user_doc["avatar"],
    created_at=user_doc["created_at"],
    job_title=user_doc.get("job_title"),
    department=user_doc.get("department"),
    extension=user_doc.get("extension"),
    phone=user_doc.get("phone"),
    location=user_doc.get("location"),
    notification_keywords=user_doc.get("notification_keywords", []),
  )


@fastapi_app.post("/auth/logout")
async def logout():
  # JWT는 상태가 없으므로 클라이언트에서 토큰을 삭제하도록 안내만 반환
  return {"status": "ok", "message": "logged out"}


# -----------------------------
# 비밀번호 재설정 API
# -----------------------------
@fastapi_app.post("/auth/forgot-password")
async def forgot_password(request_data: PasswordResetRequest):
  """비밀번호 재설정 요청 - 이메일로 재설정 링크 발송"""
  user_doc = await users_col.find_one({"email": request_data.email})

  # 보안상 이메일이 없어도 같은 응답 반환 (이메일 존재 여부 노출 방지)
  if not user_doc:
    return {"status": "ok", "message": "If the email exists, a reset link has been sent"}

  # 비밀번호 재설정 토큰 생성
  token = await create_password_reset_token(user_doc["_id"], user_doc["email"])

  # 이메일 발송 (실제 환경에서는 프론트엔드 URL로 변경)
  reset_url = f"http://localhost:3000/reset-password?token={token}"
  await send_email(
    to_email=user_doc["email"],
    subject="비밀번호 재설정 요청",
    body=f"""
    <html>
      <body>
        <h2>비밀번호 재설정</h2>
        <p>안녕하세요 {user_doc['name']}님,</p>
        <p>비밀번호 재설정을 요청하셨습니다. 아래 링크를 클릭하여 새로운 비밀번호를 설정해주세요:</p>
        <p><a href="{reset_url}">비밀번호 재설정하기</a></p>
        <p>이 링크는 1시간 동안 유효합니다.</p>
        <p>본인이 요청하지 않으셨다면 이 이메일을 무시하세요.</p>
      </body>
    </html>
    """
  )

  return {"status": "ok", "message": "If the email exists, a reset link has been sent"}


@fastapi_app.post("/auth/reset-password")
async def reset_password(reset_data: PasswordResetConfirm):
  """비밀번호 재설정 확인 - 토큰 검증 후 비밀번호 변경"""
  # 토큰 검증
  token_doc = await verify_password_reset_token(reset_data.token)
  if not token_doc:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

  # 비밀번호 길이 검증
  ensure_password_length(reset_data.new_password)

  # 새 비밀번호 해싱
  hashed_password = hash_password(reset_data.new_password)

  # 비밀번호 업데이트
  await users_col.update_one(
    {"_id": token_doc["user_id"]},
    {"$set": {"hashed_password": hashed_password}}
  )

  # 토큰 사용 완료 표시
  await mark_token_as_used(reset_data.token)

  return {"status": "ok", "message": "Password reset successful"}


# -----------------------------
# 2FA (TOTP) API
# -----------------------------
@fastapi_app.post("/auth/2fa/setup")
async def setup_2fa(current_user: User = Depends(get_current_user)):
  """2FA 설정 - TOTP 시크릿 생성 및 QR 코드 반환"""
  # TOTP 시크릿 생성
  secret = pyotp.random_base32()

  # TOTP URI 생성 (Google Authenticator 등에서 사용)
  totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
    name=current_user.email,
    issuer_name="Work Messenger"
  )

  # QR 코드 생성
  qr = qrcode.QRCode(version=1, box_size=10, border=5)
  qr.add_data(totp_uri)
  qr.make(fit=True)

  img = qr.make_image(fill_color="black", back_color="white")

  # QR 코드를 base64로 인코딩
  buffered = io.BytesIO()
  img.save(buffered, format="PNG")
  qr_code_base64 = base64.b64encode(buffered.getvalue()).decode()

  # 시크릿을 임시로 DB에 저장 (활성화되지 않은 상태)
  await users_col.update_one(
    {"_id": current_user.id},
    {"$set": {"totp_secret": secret, "totp_enabled": False}}
  )

  return {
    "secret": secret,
    "qr_code_url": f"data:image/png;base64,{qr_code_base64}"
  }


@fastapi_app.post("/auth/2fa/verify")
async def verify_2fa(verify_data: TwoFactorVerify, current_user: User = Depends(get_current_user)):
  """2FA 검증 - TOTP 코드 검증 후 2FA 활성화"""
  user_doc = await users_col.find_one({"_id": current_user.id})

  totp_secret = user_doc.get("totp_secret")
  if not totp_secret:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA setup required")

  # TOTP 검증
  totp = pyotp.TOTP(totp_secret)
  if not totp.verify(verify_data.code):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 2FA code")

  # 2FA 활성화
  await users_col.update_one(
    {"_id": current_user.id},
    {"$set": {"totp_enabled": True}}
  )

  return {"status": "ok", "message": "2FA enabled successfully"}


@fastapi_app.post("/auth/2fa/disable")
async def disable_2fa(current_user: User = Depends(get_current_user)):
  """2FA 비활성화"""
  await users_col.update_one(
    {"_id": current_user.id},
    {"$set": {"totp_enabled": False, "totp_secret": None}}
  )

  return {"status": "ok", "message": "2FA disabled successfully"}


# ========================================
# 북마크 / 저장한 메시지
# ========================================

@fastapi_app.post("/bookmarks", response_model=Bookmark)
async def create_bookmark(
  bookmark_data: BookmarkCreate,
  current_user: User = Depends(get_current_user)
):
  """메시지를 북마크(저장)"""
  # 메시지 존재 확인
  message = await messages_col.find_one({"_id": bookmark_data.message_id})
  if not message:
    raise HTTPException(status_code=404, detail="Message not found")

  # 이미 북마크했는지 확인
  existing = await bookmarks_col.find_one({
    "user_id": current_user.id,
    "message_id": bookmark_data.message_id
  })

  if existing:
    raise HTTPException(status_code=400, detail="Message already bookmarked")

  # 북마크 생성
  bookmark_id = f"bookmark_{uuid.uuid4().hex[:12]}"
  bookmark_doc = {
    "_id": bookmark_id,
    "user_id": current_user.id,
    "message_id": bookmark_data.message_id,
    "server_id": message.get("server_id"),
    "channel_id": message.get("channel_id"),
    "created_at": _now()
  }

  await bookmarks_col.insert_one(bookmark_doc)

  return Bookmark(
    id=bookmark_id,
    user_id=current_user.id,
    message_id=bookmark_data.message_id,
    server_id=message.get("server_id"),
    channel_id=message.get("channel_id"),
    created_at=bookmark_doc["created_at"]
  )


@fastapi_app.get("/bookmarks")
async def get_bookmarks(
  current_user: User = Depends(get_current_user),
  limit: int = 50,
  offset: int = 0
):
  """사용자의 북마크된 메시지 목록 조회"""
  # 북마크 목록 조회 (최신순)
  cursor = bookmarks_col.find({"user_id": current_user.id}).sort("created_at", -1).skip(offset).limit(limit)
  bookmarks = await cursor.to_list(length=limit)

  # 메시지 정보 조회
  result = []
  for bookmark in bookmarks:
    message = await messages_col.find_one({"_id": bookmark["message_id"]})
    if message:
      # 메시지 정보와 북마크 정보 결합
      result.append({
        "bookmark": {
          "id": bookmark["_id"],
          "created_at": bookmark["created_at"].isoformat()
        },
        "message": {
          "id": message["_id"],
          "content": message.get("content", ""),
          "sender": message.get("sender", {}),
          "timestamp": message.get("timestamp", ""),
          "channel_id": message.get("channel_id"),
          "server_id": message.get("server_id"),
          "attachments": message.get("attachments", []),
          "reactions": message.get("reactions", [])
        }
      })

  # 전체 북마크 개수
  total = await bookmarks_col.count_documents({"user_id": current_user.id})

  return {
    "bookmarks": result,
    "total": total,
    "limit": limit,
    "offset": offset
  }


@fastapi_app.delete("/bookmarks/{message_id}")
async def delete_bookmark(
  message_id: str,
  current_user: User = Depends(get_current_user)
):
  """북마크 삭제"""
  result = await bookmarks_col.delete_one({
    "user_id": current_user.id,
    "message_id": message_id
  })

  if result.deleted_count == 0:
    raise HTTPException(status_code=404, detail="Bookmark not found")

  return {"status": "ok", "message": "Bookmark deleted"}


@fastapi_app.get("/bookmarks/check/{message_id}")
async def check_bookmark(
  message_id: str,
  current_user: User = Depends(get_current_user)
):
  """특정 메시지가 북마크되어 있는지 확인"""
  bookmark = await bookmarks_col.find_one({
    "user_id": current_user.id,
    "message_id": message_id
  })

  return {"bookmarked": bookmark is not None}


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
    # Filter channels based on user permissions
    servers.append(_server_doc_to_model(doc, filter_user_id=current_user.id))
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
      is_private=payload.is_private,
      allowed_roles=payload.allowed_roles,
      allowed_members=payload.allowed_members,
      post_permission=payload.post_permission,
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
  if payload.is_private is not None:
    updates["categories.$[cat].channels.$[ch].is_private"] = payload.is_private
  if payload.allowed_roles is not None:
    updates["categories.$[cat].channels.$[ch].allowed_roles"] = payload.allowed_roles
  if payload.allowed_members is not None:
    updates["categories.$[cat].channels.$[ch].allowed_members"] = payload.allowed_members
  if payload.post_permission is not None:
    updates["categories.$[cat].channels.$[ch].post_permission"] = payload.post_permission
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


# ============ DM Channel Endpoints ============

@fastapi_app.post("/dm", response_model=Channel, status_code=201)
async def create_dm_channel(payload: DMCreate, authorization: str = Header(None)):
  """Create a new DM or group DM channel"""
  # Get current user from auth token
  if not authorization or not authorization.startswith("Bearer "):
    raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

  token = authorization.replace("Bearer ", "")
  # Decode token to get user_id (simplified - you may want to use proper JWT validation)
  current_user_id = token  # For now, using token as user_id

  # Normalize participants list (remove duplicates, sort for consistency)
  all_participants = list(set([current_user_id] + payload.participants))
  all_participants.sort()

  # Determine DM type
  dm_type = "dm" if len(all_participants) == 2 else "group_dm"

  # Check if DM channel already exists between these participants
  existing_dm = await dm_channels_col.find_one({
    "type": dm_type,
    "participants": all_participants
  })

  if existing_dm:
    # Return existing DM channel
    return Channel(
      id=existing_dm["_id"],
      name=existing_dm.get("name", ""),
      type=existing_dm.get("type", dm_type),
      unread=existing_dm.get("unread", 0),
      participants=existing_dm.get("participants", []),
      server_id=None
    )

  # Create new DM channel
  dm_id = f"dm_{uuid.uuid4().hex[:8]}"

  # Generate name if not provided
  if not payload.name:
    if dm_type == "dm":
      # For 1:1 DM, use other user's name
      other_user_id = [p for p in all_participants if p != current_user_id][0]
      user_doc = await users_col.find_one({"_id": other_user_id})
      channel_name = user_doc.get("name", other_user_id) if user_doc else other_user_id
    else:
      # For group DM, use participant names
      user_docs = await users_col.find({"_id": {"$in": all_participants}}).to_list(None)
      names = [u.get("name", u["_id"]) for u in user_docs]
      channel_name = ", ".join(names[:3])
      if len(names) > 3:
        channel_name += f" +{len(names) - 3}"
  else:
    channel_name = payload.name

  dm_channel = {
    "_id": dm_id,
    "name": channel_name,
    "type": dm_type,
    "unread": 0,
    "participants": all_participants,
    "created_at": datetime.utcnow()
  }

  await dm_channels_col.insert_one(dm_channel)

  return Channel(
    id=dm_id,
    name=channel_name,
    type=dm_type,
    unread=0,
    participants=all_participants,
    server_id=None
  )


@fastapi_app.get("/dm", response_model=List[Channel])
async def get_dm_channels(authorization: str = Header(None)):
  """Get all DM channels for the current user"""
  if not authorization or not authorization.startswith("Bearer "):
    raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

  token = authorization.replace("Bearer ", "")
  current_user_id = token  # For now, using token as user_id

  # Find all DM channels where user is a participant
  dm_docs = await dm_channels_col.find({
    "participants": current_user_id
  }).to_list(None)

  channels = []
  for dm_doc in dm_docs:
    channels.append(Channel(
      id=dm_doc["_id"],
      name=dm_doc.get("name", ""),
      type=dm_doc.get("type", "dm"),
      unread=dm_doc.get("unread", 0),
      participants=dm_doc.get("participants", []),
      server_id=None
    ))

  return channels


@fastapi_app.get(
    "/channels/{channel_id}/messages",
    response_model=List[Message],
)
async def list_messages(channel_id: str):
  # Check if it's a DM channel
  if channel_id.startswith("dm_"):
    dm_channel = await dm_channels_col.find_one({"_id": channel_id})
    if not dm_channel:
      raise HTTPException(status_code=404, detail="DM channel not found")
  else:
    # Check if it's a server channel
    server, category, channel = await _ensure_channel(channel_id)
    if not channel:
      raise HTTPException(status_code=404, detail="Channel not found")

  # thread_id가 없는 메시지만 조회 (답글은 제외)
  cursor = messages_col.find({
    "channel_id": channel_id,
    "$or": [{"thread_id": None}, {"thread_id": {"$exists": False}}]
  }).sort("timestamp", 1)
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
            thread_id=doc.get("thread_id"),
            reply_count=doc.get("reply_count", 0),
        )
    )
  return messages


@fastapi_app.get(
    "/messages/{message_id}/replies",
    response_model=List[Message],
)
async def list_thread_replies(message_id: str):
  """특정 메시지의 답글(스레드) 조회"""
  # 원본 메시지 확인
  parent_msg = await messages_col.find_one({"_id": message_id})
  if not parent_msg:
    raise HTTPException(status_code=404, detail="Message not found")

  # 답글 조회
  cursor = messages_col.find({"thread_id": message_id}).sort("timestamp", 1)
  replies: List[Message] = []
  async for doc in cursor:
    # 암호화된 content 복호화
    decrypted_content = decrypt_text(doc["content"])
    replies.append(
        Message(
            id=doc["_id"],
            channel_id=doc["channel_id"],
            sender=Sender(**doc["sender"]),
            content=decrypted_content,
            timestamp=doc["timestamp"],
            files=[FileAttachment(**f) for f in doc.get("files", [])],
            thread_id=doc.get("thread_id"),
            reply_count=doc.get("reply_count", 0),
        )
    )
  return replies


@fastapi_app.post(
    "/channels/{channel_id}/messages",
    response_model=Message,
    status_code=201,
)
async def create_message(channel_id: str, payload: MessageCreate):
  # Check if it's a DM channel
  if channel_id.startswith("dm_"):
    dm_channel = await dm_channels_col.find_one({"_id": channel_id})
    if not dm_channel:
      raise HTTPException(status_code=404, detail="DM channel not found")
    # Verify sender is a participant
    if payload.sender and payload.sender.id:
      if payload.sender.id not in dm_channel.get("participants", []):
        raise HTTPException(status_code=403, detail="Not a participant of this DM")
  else:
    # Check if it's a server channel
    server, category, channel = await _ensure_channel(channel_id)
    if not channel:
      raise HTTPException(status_code=404, detail="Channel not found")
    if payload.sender and payload.sender.id:
      # 서버 멤버가 아닌 경우 차단
      server_doc = await servers_col.find_one({"_id": server.id, "members.id": payload.sender.id})
      if not server_doc:
        raise HTTPException(status_code=403, detail="Not a member of this server")

      # Get user's role and check channel access permission
      user_role = await _get_user_role(server.id, payload.sender.id)
      if not _can_access_channel(channel, payload.sender.id, user_role or "member"):
        raise HTTPException(status_code=403, detail="You don't have permission to access this channel")

      # Check post permission
      if not _can_post_in_channel(channel, user_role or "member"):
        raise HTTPException(status_code=403, detail="You don't have permission to post in this channel")

  sender = _build_sender(payload.sender)
  message = Message(
      id=f"msg_{uuid.uuid4().hex[:12]}",
      channel_id=channel_id,
      sender=sender,
      content=payload.content,
      timestamp=_now(),
      files=payload.files,
      thread_id=payload.thread_id,
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
          "thread_id": payload.thread_id,
      }
  )

  # 답글인 경우 원본 메시지의 reply_count 증가
  if payload.thread_id:
    await messages_col.update_one(
      {"_id": payload.thread_id},
      {"$inc": {"reply_count": 1}}
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


@fastapi_app.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
  """메시지 삭제 (본인 또는 관리자만 가능)"""
  # 메시지 조회
  msg_doc = await messages_col.find_one({"_id": message_id})
  if not msg_doc:
    raise HTTPException(status_code=404, detail="Message not found")

  # 서버 정보 조회 (권한 확인용)
  server_doc = await servers_col.find_one({"categories.channels.id": msg_doc["channel_id"]})
  if not server_doc:
    raise HTTPException(status_code=404, detail="Server not found")

  # 권한 확인: 본인 또는 관리자
  is_owner = msg_doc["sender"]["id"] == current_user.id
  member = next((m for m in server_doc.get("members", []) if m["id"] == current_user.id), None)
  is_admin = member and member.get("role") in ["owner", "admin", "moderator"] if member else False

  if not (is_owner or is_admin):
    raise HTTPException(status_code=403, detail="You don't have permission to delete this message")

  # 감사 로그 생성
  old_content = decrypt_text(msg_doc["content"])
  audit_log = {
    "_id": f"audit_{uuid.uuid4().hex[:12]}",
    "action": "delete_message",
    "user_id": current_user.id,
    "user_name": current_user.username,
    "target_id": message_id,
    "target_type": "message",
    "old_content": old_content,
    "new_content": None,
    "timestamp": _now(),
    "channel_id": msg_doc["channel_id"],
    "server_id": server_doc["_id"]
  }
  await audit_logs_col.insert_one(audit_log)

  # 메시지 삭제 (소프트 삭제)
  await messages_col.update_one(
    {"_id": message_id},
    {
      "$set": {
        "is_deleted": True,
        "content": encrypt_text("[삭제된 메시지]")
      }
    }
  )

  # Socket.IO로 브로드캐스트
  await sio.emit(
    "message_deleted",
    {
      "channelId": msg_doc["channel_id"],
      "messageId": message_id
    },
    room=msg_doc["channel_id"]
  )

  return {"status": "deleted", "message_id": message_id}


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
  print(f"[backend] Received message event: channel_id={channel_id}, sid={sid}")
  raw_message = data.get("message") or {}
  sender_payload = raw_message.get("sender")
  content = raw_message.get("content") or ""
  files_payload = raw_message.get("files") or []
  thread_id = raw_message.get("thread_id") or raw_message.get("threadId")

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
      thread_id=thread_id,
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
          "thread_id": thread_id,
      }
  )

  # 답글인 경우 원본 메시지의 reply_count 증가
  if thread_id:
    await messages_col.update_one(
      {"_id": thread_id},
      {"$inc": {"reply_count": 1}}
    )

  print(f"[backend] message saved (socket) channel={channel_id}, id={message_obj.id}, sender={message_obj.sender.name}")

  # 멘션 및 키워드 알림 처리 (암호화되지 않은 원본 content 사용)
  if message_obj.sender.id:
    await process_mentions_and_keywords(message_obj.id, channel_id, content, message_obj.sender.id)

  await sio.emit(
      "message",
      {"channelId": channel_id, "message": _message_to_response(message_obj)},
      room=channel_id,
  )
  return True


# -----------------------------
# AI 기능
# -----------------------------

async def summarize_conversation(messages: List[Dict]) -> str:
  """대화 내용을 요약합니다"""
  if not openai_client:
    raise HTTPException(status_code=503, detail="OpenAI API가 설정되지 않았습니다")

  if not messages:
    return "요약할 메시지가 없습니다."

  # 메시지를 텍스트로 변환
  conversation_text = "\n".join([
    f"{msg.get('sender', {}).get('name', 'Unknown')}: {decrypt_text(msg.get('content', ''))}"
    for msg in messages
  ])

  try:
    response = openai_client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": "당신은 대화 내용을 간결하게 요약하는 어시스턴트입니다. 3줄 이내로 핵심만 요약해주세요."},
        {"role": "user", "content": f"다음 대화를 3줄로 요약해주세요:\n\n{conversation_text}"}
      ],
      temperature=0.3,
      max_tokens=300
    )
    return response.choices[0].message.content
  except Exception as e:
    print(f"[AI] 요약 오류: {e}")
    raise HTTPException(status_code=500, detail=f"요약 생성 중 오류 발생: {str(e)}")


async def extract_tasks(messages: List[Dict]) -> List[Dict]:
  """대화에서 할 일을 추출합니다"""
  if not openai_client:
    raise HTTPException(status_code=503, detail="OpenAI API가 설정되지 않았습니다")

  if not messages:
    return []

  # 메시지를 텍스트로 변환
  conversation_text = "\n".join([
    f"{msg.get('sender', {}).get('name', 'Unknown')}: {decrypt_text(msg.get('content', ''))}"
    for msg in messages
  ])

  try:
    response = openai_client.chat.completions.create(
      model="gpt-4o-mini",
      messages=[
        {"role": "system", "content": """당신은 대화에서 할 일(TODO)을 추출하는 어시스턴트입니다.
다음 형식의 JSON 배열로 응답해주세요:
[
  {"task": "할 일 내용", "assignee": "담당자 이름 (언급된 경우)", "deadline": "마감일 (언급된 경우)"},
  ...
]
언급되지 않은 필드는 null로 설정하세요."""},
        {"role": "user", "content": f"다음 대화에서 할 일을 추출해주세요:\n\n{conversation_text}"}
      ],
      temperature=0.3,
      max_tokens=500,
      response_format={"type": "json_object"}
    )

    import json
    result = json.loads(response.choices[0].message.content)
    # tasks 키가 있으면 그것을 사용, 없으면 전체를 배열로 간주
    tasks = result.get("tasks", result if isinstance(result, list) else [])
    return tasks if isinstance(tasks, list) else []
  except Exception as e:
    print(f"[AI] 할 일 추출 오류: {e}")
    raise HTTPException(status_code=500, detail=f"할 일 추출 중 오류 발생: {str(e)}")


@fastapi_app.post("/channels/{channel_id}/summarize")
async def summarize_channel(
    channel_id: str,
    hours: int = 1,
    current_user: User = Depends(get_current_user)
):
  """최근 대화를 요약합니다"""
  # 권한 확인 (채널 멤버인지)
  # 간단하게 메시지가 있는지만 확인
  since = _now() - timedelta(hours=hours)

  messages_cursor = messages_col.find({
    "channel_id": channel_id,
    "timestamp": {"$gte": since}
  }).sort("timestamp", 1)

  messages = await messages_cursor.to_list(length=100)

  if not messages:
    return {"summary": f"최근 {hours}시간 동안 메시지가 없습니다."}

  summary = await summarize_conversation(messages)
  return {"summary": summary, "message_count": len(messages), "hours": hours}


@fastapi_app.post("/messages/{message_id}/summarize-thread")
async def summarize_thread(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
  """특정 스레드(답글)를 요약합니다"""
  # 원본 메시지 확인
  parent_msg = await messages_col.find_one({"_id": message_id})
  if not parent_msg:
    raise HTTPException(status_code=404, detail="Message not found")

  # 스레드의 모든 답글 조회
  messages_cursor = messages_col.find({
    "thread_id": message_id
  }).sort("timestamp", 1)

  messages = await messages_cursor.to_list(length=100)

  if not messages:
    return {"summary": "이 메시지에 답글이 없습니다.", "message_count": 0}

  summary = await summarize_conversation(messages)
  return {"summary": summary, "message_count": len(messages), "thread_id": message_id}


@fastapi_app.post("/channels/{channel_id}/extract-tasks")
async def extract_channel_tasks(
    channel_id: str,
    hours: int = 24,
    current_user: User = Depends(get_current_user)
):
  """최근 대화에서 할 일을 추출합니다"""
  since = _now() - timedelta(hours=hours)

  messages_cursor = messages_col.find({
    "channel_id": channel_id,
    "timestamp": {"$gte": since}
  }).sort("timestamp", 1)

  messages = await messages_cursor.to_list(length=200)

  if not messages:
    return {"tasks": [], "message_count": 0}

  tasks = await extract_tasks(messages)
  return {"tasks": tasks, "message_count": len(messages), "hours": hours}
@sio.event
async def typing_start(sid, data):
  channel_id = data.get("channelId") or data.get("channel_id")
  user_id = online_users.get(sid)
  if channel_id and user_id:
    # Get user name for display
    user_doc = await users_col.find_one({"_id": user_id})
    if user_doc:
        username = user_doc.get("name") or user_doc.get("username")
        await sio.emit(
            "typing_start",
            {"channelId": channel_id, "userId": user_id, "username": username},
            room=channel_id,
            skip_sid=sid
        )

@sio.event
async def typing_stop(sid, data):
  channel_id = data.get("channelId") or data.get("channel_id")
  user_id = online_users.get(sid)
  if channel_id and user_id:
    await sio.emit(
        "typing_stop",
        {"channelId": channel_id, "userId": user_id},
        room=channel_id,
        skip_sid=sid
    )

@sio.event
async def channel_read(sid, data):
  """Update last read time via socket for real-time receipts"""
  channel_id = data.get("channelId") or data.get("channel_id")
  user_id = online_users.get(sid)
  
  if channel_id and user_id:
      timestamp = _now()
      
      # Update DB
      await user_channel_reads_col.update_one(
        {"user_id": user_id, "channel_id": channel_id},
        {"$set": {"last_read_at": timestamp}},
        upsert=True
      )

      # Broadcast update
      await sio.emit(
          "user_read_update",
          {"channelId": channel_id, "userId": user_id, "lastReadAt": timestamp.isoformat()},
          room=channel_id
      )

# ========================================
# WebRTC Signaling
# ========================================

@sio.event
async def call_join(sid, data):
  room = data.get("currentChannelId") or data.get("channelId")
  if not room: return
  
  # Tell others in room that a user joined the call
  await sio.emit("call_user_joined", {"signal": data.get("signal"), "callerId": sid}, room=room, skip_sid=sid)

@sio.event
async def offer(sid, data):
  # data: { targetSid, description, channelId }
  target_sid = data.get("targetSid")
  if target_sid:
    await sio.emit("offer", {
      "sdp": data.get("sdp"),
      "callerId": sid,
      "channelId": data.get("channelId")
    }, to=target_sid)

@sio.event
async def answer(sid, data):
  # data: { targetSid, sdp, channelId }
  target_sid = data.get("targetSid")
  if target_sid:
    await sio.emit("answer", {
      "sdp": data.get("sdp"),
      "callerId": sid,
      "channelId": data.get("channelId")
    }, to=target_sid)

@sio.event
async def ice_candidate(sid, data):
  # data: { targetSid, candidate, channelId }
  target_sid = data.get("targetSid")
  if target_sid:
    await sio.emit("ice_candidate", {
      "candidate": data.get("candidate"),
      "callerId": sid,
      "channelId": data.get("channelId")
    }, to=target_sid)

@sio.event
async def call_leave(sid, data):
    room = data.get("channelId")
    if room:
        await sio.emit("call_user_left", {"id": sid}, room=room)


# ========================================
# 검색 API
# ========================================

@fastapi_app.post("/search/messages", response_model=SearchMessagesResponse)
async def search_messages(
    search_query: SearchQuery,
    current_user: User = Depends(get_current_user)
):
  """메시지 검색 (채널, 서버, 작성자, 날짜 필터 지원)"""
  # Build MongoDB query
  mongo_query = {"is_deleted": {"$ne": True}}

  # Text search in content (decrypt and search)
  # Note: For production, consider using MongoDB text indexes
  # For now, we'll use regex on decrypted content

  # Author filter
  if search_query.author:
    mongo_query["$or"] = [
      {"sender.username": {"$regex": search_query.author, "$options": "i"}},
      {"sender.id": search_query.author}
    ]

  # Date range filter
  if search_query.from_date or search_query.to_date:
    date_query = {}
    if search_query.from_date:
      date_query["$gte"] = search_query.from_date
    if search_query.to_date:
      date_query["$lte"] = search_query.to_date
    mongo_query["timestamp"] = date_query

  # My messages only filter
  if search_query.my_messages_only:
    mongo_query["sender.id"] = current_user.id

  # Channel filter
  if search_query.channel_id:
    mongo_query["channel_id"] = search_query.channel_id

  # Get all messages matching filters
  messages_cursor = messages_col.find(mongo_query).sort("timestamp", -1)
  all_messages = await messages_cursor.to_list(length=1000)

  # Filter by text search in decrypted content
  matching_messages = []
  query_lower = search_query.query.lower()

  for msg_doc in all_messages:
    decrypted_content = decrypt_text(msg_doc.get("content", ""))
    if query_lower in decrypted_content.lower():
      matching_messages.append(msg_doc)

  # Server filter (if specified, check if message's channel belongs to server)
  if search_query.server_id:
    server_doc = await servers_col.find_one({"_id": search_query.server_id})
    if server_doc:
      # Get all channel IDs in this server
      server_channel_ids = []
      for cat in server_doc.get("categories", []):
        for ch in cat.get("channels", []):
          server_channel_ids.append(ch["id"])

      # Filter messages to only those in server channels
      matching_messages = [
        msg for msg in matching_messages
        if msg["channel_id"] in server_channel_ids
      ]

  # Apply pagination
  total = len(matching_messages)
  paginated_messages = matching_messages[search_query.offset:search_query.offset + search_query.limit]

  # Build results with context
  results = []
  for msg_doc in paginated_messages:
    # Find channel info
    channel_name = "Unknown"
    server_id = None
    server_name = None

    # Try to find in regular servers
    server_doc = await servers_col.find_one({"categories.channels.id": msg_doc["channel_id"]})
    if server_doc:
      server_id = server_doc["_id"]
      server_name = server_doc["name"]
      for cat in server_doc.get("categories", []):
        for ch in cat.get("channels", []):
          if ch["id"] == msg_doc["channel_id"]:
            channel_name = ch["name"]
            break
    else:
      # Try DM channels
      dm_doc = await dm_channels_col.find_one({"_id": msg_doc["channel_id"]})
      if dm_doc:
        channel_name = dm_doc.get("name", "Direct Message")

    # Create highlight snippet
    decrypted_content = decrypt_text(msg_doc.get("content", ""))
    highlight = _create_highlight(decrypted_content, search_query.query)

    # Build message object
    message = Message(
      id=msg_doc["_id"],
      channel_id=msg_doc["channel_id"],
      sender=Sender(**msg_doc["sender"]),
      content=decrypted_content,
      timestamp=msg_doc["timestamp"],
      files=msg_doc.get("files", []),
      thread_id=msg_doc.get("thread_id"),
      reply_count=msg_doc.get("reply_count", 0),
      edited_at=msg_doc.get("edited_at"),
      is_deleted=msg_doc.get("is_deleted", False)
    )

    results.append(MessageSearchResult(
      message=message,
      server_id=server_id,
      server_name=server_name,
      channel_name=channel_name,
      highlight=highlight
    ))

  return SearchMessagesResponse(
    results=results,
    total=total,
    query=search_query.query
  )


def _create_highlight(content: str, query: str, context_chars: int = 100) -> str:
  """Create highlighted snippet around search query"""
  query_lower = query.lower()
  content_lower = content.lower()

  idx = content_lower.find(query_lower)
  if idx == -1:
    return content[:200]

  start = max(0, idx - context_chars)
  end = min(len(content), idx + len(query) + context_chars)

  snippet = content[start:end]
  if start > 0:
    snippet = "..." + snippet
  if end < len(content):
    snippet = snippet + "..."

  return snippet


@fastapi_app.post("/search/files", response_model=SearchFilesResponse)
async def search_files(
    search_query: SearchQuery,
    current_user: User = Depends(get_current_user)
):
  """파일 검색 (파일명 기반)"""
  # Build MongoDB query for messages with files
  mongo_query = {
    "is_deleted": {"$ne": True},
    "files": {"$exists": True, "$ne": []}
  }

  # Date range filter
  if search_query.from_date or search_query.to_date:
    date_query = {}
    if search_query.from_date:
      date_query["$gte"] = search_query.from_date
    if search_query.to_date:
      date_query["$lte"] = search_query.to_date
    mongo_query["timestamp"] = date_query

  # Channel filter
  if search_query.channel_id:
    mongo_query["channel_id"] = search_query.channel_id

  # Get messages with files
  messages_cursor = messages_col.find(mongo_query).sort("timestamp", -1)
  all_messages = await messages_cursor.to_list(length=1000)

  # Filter files by filename
  matching_files = []
  query_lower = search_query.query.lower()

  for msg_doc in all_messages:
    for file_attach in msg_doc.get("files", []):
      if query_lower in file_attach.get("name", "").lower():
        matching_files.append({
          "file": file_attach,
          "message": msg_doc
        })

  # Server filter
  if search_query.server_id:
    server_doc = await servers_col.find_one({"_id": search_query.server_id})
    if server_doc:
      server_channel_ids = []
      for cat in server_doc.get("categories", []):
        for ch in cat.get("channels", []):
          server_channel_ids.append(ch["id"])

      matching_files = [
        item for item in matching_files
        if item["message"]["channel_id"] in server_channel_ids
      ]

  # Apply pagination
  total = len(matching_files)
  paginated_files = matching_files[search_query.offset:search_query.offset + search_query.limit]

  # Build results
  results = []
  for item in paginated_files:
    msg_doc = item["message"]
    file_attach = item["file"]

    # Find channel info
    channel_name = "Unknown"
    server_id = None
    server_name = None

    server_doc = await servers_col.find_one({"categories.channels.id": msg_doc["channel_id"]})
    if server_doc:
      server_id = server_doc["_id"]
      server_name = server_doc["name"]
      for cat in server_doc.get("categories", []):
        for ch in cat.get("channels", []):
          if ch["id"] == msg_doc["channel_id"]:
            channel_name = ch["name"]
            break
    else:
      dm_doc = await dm_channels_col.find_one({"_id": msg_doc["channel_id"]})
      if dm_doc:
        channel_name = dm_doc.get("name", "Direct Message")

    results.append(FileSearchResult(
      file=FileAttachment(**file_attach),
      message_id=msg_doc["_id"],
      channel_id=msg_doc["channel_id"],
      channel_name=channel_name,
      server_id=server_id,
      server_name=server_name,
      sender=Sender(**msg_doc["sender"]),
      timestamp=msg_doc["timestamp"]
    ))

  return SearchFilesResponse(
    results=results,
    total=total,
    query=search_query.query
  )


# ========================================
# 미읽음 & 알림 관리 API
# ========================================

@fastapi_app.post("/channels/{channel_id}/mark-read")
async def mark_channel_as_read(
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
  """채널을 읽음으로 표시"""
  timestamp = _now()

  # Upsert last read timestamp for this user-channel combination
  await user_channel_reads_col.update_one(
    {"user_id": current_user.id, "channel_id": channel_id},
    {"$set": {"last_read_at": timestamp}},
    upsert=True
  )
  
  # Broadcast update via socket if connected?
  # The client is expected to emit 'channel_read` socket event for real-time, 
  # but this REST API handles the persistence.
  # We could broadcast here too but that might duplicate events if client does both.
  # Let's rely on client emitting socket event for now, or add broadcast here.
  # For safety, let's just stick to DB update here.

  return {"success": True, "channel_id": channel_id, "last_read_at": timestamp}


@fastapi_app.get("/channels/{channel_id}/read-states")
async def get_channel_read_states(
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """채널 멤버들의 읽음 상태 조회"""
    # Verify user has access to channel (simplified: just check if channel exists?)
    # ideally check if user is in server/channel
    
    cursor = user_channel_reads_col.find({"channel_id": channel_id})
    read_states = {}
    async for doc in cursor:
        read_states[doc["user_id"]] = doc["last_read_at"]
        
    return read_states


@fastapi_app.get("/unreads", response_model=UnreadCountsResponse)
async def get_unread_counts(
    current_user: User = Depends(get_current_user)
):
  """전체 채널의 미읽음 카운트 조회"""
  unreads = []

  # Get all user's last read timestamps
  reads_cursor = user_channel_reads_col.find({"user_id": current_user.id})
  last_reads = {}
  async for read_doc in reads_cursor:
    last_reads[read_doc["channel_id"]] = read_doc["last_read_at"]

  # Get all channels user has access to (from servers and DMs)
  servers_cursor = servers_col.find({"members.id": current_user.id})
  channel_ids = set()

  async for server_doc in servers_cursor:
    for cat in server_doc.get("categories", []):
      for ch in cat.get("channels", []):
        channel_ids.add(ch["id"])

  # Add DM channels
  dm_cursor = dm_channels_col.find({"participants": current_user.id})
  async for dm_doc in dm_cursor:
    channel_ids.add(dm_doc["_id"])

  # Count unread messages for each channel
  for channel_id in channel_ids:
    last_read = last_reads.get(channel_id)

    # Build query for messages newer than last read
    msg_query = {
      "channel_id": channel_id,
      "is_deleted": {"$ne": True}
    }

    if last_read:
      msg_query["timestamp"] = {"$gt": last_read}

    # Count total unread
    unread_count = await messages_col.count_documents(msg_query)

    # Check if any are mentions
    mention_query = msg_query.copy()
    mention_query["content"] = {"$regex": f"@{current_user.username}", "$options": "i"}
    has_mention = await messages_col.count_documents(mention_query) > 0

    if unread_count > 0:
      unreads.append(UnreadCount(
        channel_id=channel_id,
        count=unread_count,
        has_mention=has_mention
      ))

  return UnreadCountsResponse(unreads=unreads)


@fastapi_app.get("/notification-settings", response_model=NotificationSettings)
async def get_notification_settings(
    current_user: User = Depends(get_current_user)
):
  """알림 설정 조회"""
  settings_doc = await notification_settings_col.find_one({"user_id": current_user.id})

  if not settings_doc:
    # Return default settings
    return NotificationSettings(
      user_id=current_user.id,
      channels=[],
      servers=[],
      desktop_enabled=True,
      sound_enabled=True
    )

  return NotificationSettings(**settings_doc)


@fastapi_app.put("/notification-settings", response_model=NotificationSettings)
async def update_notification_settings(
    settings: NotificationSettings,
    current_user: User = Depends(get_current_user)
):
  """알림 설정 업데이트"""
  settings.user_id = current_user.id

  await notification_settings_col.update_one(
    {"user_id": current_user.id},
    {"$set": settings.model_dump()},
    upsert=True
  )

  return settings


@fastapi_app.post("/channels/{channel_id}/notification-level")
async def set_channel_notification_level(
    channel_id: str,
    level: str,  # "all" | "mentions" | "nothing"
    current_user: User = Depends(get_current_user)
):
  """채널별 알림 레벨 설정"""
  # Get current settings
  settings_doc = await notification_settings_col.find_one({"user_id": current_user.id})

  if not settings_doc:
    settings_doc = {
      "user_id": current_user.id,
      "channels": [],
      "servers": [],
      "desktop_enabled": True,
      "sound_enabled": True
    }

  # Update or add channel setting
  channels = settings_doc.get("channels", [])
  found = False
  for ch_setting in channels:
    if ch_setting["channel_id"] == channel_id:
      ch_setting["level"] = level
      found = True
      break

  if not found:
    channels.append({"channel_id": channel_id, "level": level})

  settings_doc["channels"] = channels

  await notification_settings_col.update_one(
    {"user_id": current_user.id},
    {"$set": settings_doc},
    upsert=True
  )

  return {"success": True, "channel_id": channel_id, "level": level}


@fastapi_app.get("/mentions", response_model=MentionsResponse)
async def get_my_mentions(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user)
):
  """내가 언급된 알림 목록 조회"""
  # Query notifications where user was mentioned
  query = {
    "user_id": current_user.id,
    "type": "mention",
    "read": False
  }

  total = await notifications_col.count_documents(query)

  notifications_cursor = notifications_col.find(query).sort("created_at", -1).skip(offset).limit(limit)

  mentions = []
  async for notif_doc in notifications_cursor:
    mentions.append(Notification(
      id=notif_doc["_id"],
      user_id=notif_doc["user_id"],
      type=notif_doc["type"],
      message_id=notif_doc["message_id"],
      channel_id=notif_doc["channel_id"],
      content=notif_doc["content"],
      trigger=notif_doc["trigger"],
      read=notif_doc.get("read", False),
      created_at=notif_doc["created_at"]
    ))

  return MentionsResponse(mentions=mentions, total=total)


@fastapi_app.post("/notifications/{notification_id}/mark-read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
  """알림을 읽음으로 표시"""
  result = await notifications_col.update_one(
    {"_id": notification_id, "user_id": current_user.id},
    {"$set": {"read": True}}
  )

  if result.matched_count == 0:
    raise HTTPException(status_code=404, detail="Notification not found")

  return {"success": True}


@fastapi_app.post("/notifications/mark-all-read")
async def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user)
):
  """모든 알림을 읽음으로 표시"""
  await notifications_col.update_many(
    {"user_id": current_user.id, "read": False},
    {"$set": {"read": True}}
  )

  return {"success": True}


# uvicorn entrypoint expects `app`
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

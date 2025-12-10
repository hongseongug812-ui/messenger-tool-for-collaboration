"""
Common Pydantic Models
Shared across all microservices
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr


# ========================================
# User Models
# ========================================

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
    notification_keywords: List[str] = Field(default_factory=list)
    deleted_at: Optional[datetime] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    extension: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    nickname: Optional[str] = None
    status_message: Optional[str] = None
    totp_enabled: bool = False


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    extension: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    nickname: Optional[str] = None
    status_message: Optional[str] = None


# ========================================
# Message Models
# ========================================

class Sender(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=80)
    avatar: str = Field("U", min_length=1, max_length=2)


class MessageCreate(BaseModel):
    content: str = Field("", max_length=10000)
    files: List[dict] = Field(default_factory=list)
    sender: Optional[Sender] = None
    thread_id: Optional[str] = None


class Message(BaseModel):
    id: str = Field(alias="_id")
    channel_id: str
    sender: Sender
    content: str
    timestamp: datetime
    files: List[dict] = Field(default_factory=list)
    thread_id: Optional[str] = None
    reply_count: int = 0
    edited_at: Optional[datetime] = None
    is_deleted: bool = False
    is_pinned: bool = False
    reactions: List[dict] = Field(default_factory=list)


# ========================================
# Server/Channel Models
# ========================================

class ChannelMember(BaseModel):
    id: str
    name: str
    avatar: str = "U"
    role: str = "member"


class Channel(BaseModel):
    id: str
    name: str
    type: str = "text"  # "text" | "dm" | "group_dm"
    unread: int = 0
    members: List[ChannelMember] = Field(default_factory=list)
    server_id: Optional[str] = None
    participants: List[str] = Field(default_factory=list)
    is_private: bool = False
    allowed_roles: List[str] = Field(default_factory=list)
    allowed_members: List[str] = Field(default_factory=list)
    post_permission: str = "everyone"


class Category(BaseModel):
    id: str
    name: str
    channels: List[Channel] = Field(default_factory=list)


class ServerMember(BaseModel):
    id: str
    name: str
    avatar: str
    role: str = "member"


class Server(BaseModel):
    id: str = Field(alias="_id")
    name: str
    icon: Optional[str] = None
    owner_id: str
    categories: List[Category] = Field(default_factory=list)
    members: List[ServerMember] = Field(default_factory=list)


# ========================================
# Notification Models
# ========================================

class Notification(BaseModel):
    id: str
    user_id: str
    type: str  # "mention" | "keyword" | "reminder"
    message_id: Optional[str] = None
    channel_id: Optional[str] = None
    content: str
    trigger: str
    read: bool = False
    created_at: datetime


class Reminder(BaseModel):
    id: str
    user_id: str
    text: str
    remind_at: datetime
    created_at: datetime
    completed: bool = False
    message_id: Optional[str] = None
    channel_id: Optional[str] = None

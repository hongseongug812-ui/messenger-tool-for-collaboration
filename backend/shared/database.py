"""
MongoDB Database Connection Module
Shared across all microservices
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "work_messenger")

# MongoDB Client
client = None
db = None

# Collections
users_col = None
servers_col = None
messages_col = None
notifications_col = None
reminders_col = None
bookmarks_col = None
audit_logs_col = None
password_reset_tokens_col = None
user_sessions_col = None


async def connect_db():
    """Initialize database connection"""
    global client, db, users_col, servers_col, messages_col
    global notifications_col, reminders_col, bookmarks_col
    global audit_logs_col, password_reset_tokens_col, user_sessions_col
    
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    
    # Initialize collections
    users_col = db["users"]
    servers_col = db["servers"]
    messages_col = db["messages"]
    notifications_col = db["notifications"]
    reminders_col = db["reminders"]
    bookmarks_col = db["bookmarks"]
    audit_logs_col = db["audit_logs"]
    password_reset_tokens_col = db["password_reset_tokens"]
    user_sessions_col = db["user_sessions"]
    
    print(f"[Database] Connected to MongoDB: {MONGO_URI} / {MONGO_DB}")
    return db


async def close_db():
    """Close database connection"""
    global client
    if client:
        client.close()
        print("[Database] MongoDB connection closed")


def get_db():
    """Get database instance"""
    return db


def get_collections():
    """Get all collections"""
    return {
        "users": users_col,
        "servers": servers_col,
        "messages": messages_col,
        "notifications": notifications_col,
        "reminders": reminders_col,
        "bookmarks": bookmarks_col,
        "audit_logs": audit_logs_col,
        "password_reset_tokens": password_reset_tokens_col,
        "user_sessions": user_sessions_col,
    }

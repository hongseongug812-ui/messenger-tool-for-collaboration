"""
Notification Service
Handles notifications and reminders
Port: 8005
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db, get_collections
from shared.auth import get_current_user_id

app = FastAPI(title="Notification Service", version="1.0.0")

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
    return {"status": "ok", "service": "notification"}


@app.get("/notifications")
async def get_notifications(
    user_id: str = Depends(get_current_user_id),
    limit: int = 50
):
    """Get user notifications"""
    cols = get_collections()
    
    cursor = cols["notifications"].find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(limit)
    
    notifications = await cursor.to_list(length=limit)
    
    for notif in notifications:
        notif["id"] = notif.pop("_id")
    
    return {"notifications": notifications}


@app.post("/notifications/{notif_id}/read")
async def mark_read(
    notif_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Mark notification as read"""
    cols = get_collections()
    
    await cols["notifications"].update_one(
        {"_id": notif_id, "user_id": user_id},
        {"$set": {"read": True}}
    )
    
    return {"status": "ok"}


@app.post("/notifications/read-all")
async def mark_all_read(user_id: str = Depends(get_current_user_id)):
    """Mark all notifications as read"""
    cols = get_collections()
    
    await cols["notifications"].update_many(
        {"user_id": user_id},
        {"$set": {"read": True}}
    )
    
    return {"status": "ok"}


# Reminders
@app.get("/reminders")
async def get_reminders(user_id: str = Depends(get_current_user_id)):
    """Get user reminders"""
    cols = get_collections()
    
    cursor = cols["reminders"].find(
        {"user_id": user_id, "completed": False}
    ).sort("remind_at", 1)
    
    reminders = await cursor.to_list(length=50)
    
    for reminder in reminders:
        reminder["id"] = reminder.pop("_id")
    
    return {"reminders": reminders}


@app.post("/reminders")
async def create_reminder(
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Create a reminder"""
    cols = get_collections()
    
    reminder_id = f"rem_{uuid.uuid4().hex[:12]}"
    
    new_reminder = {
        "_id": reminder_id,
        "user_id": user_id,
        "text": data.get("text", ""),
        "remind_at": data.get("remind_at"),
        "created_at": datetime.now(timezone.utc),
        "completed": False,
        "message_id": data.get("message_id"),
        "channel_id": data.get("channel_id"),
    }
    
    await cols["reminders"].insert_one(new_reminder)
    
    new_reminder["id"] = new_reminder.pop("_id")
    return new_reminder


@app.delete("/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a reminder"""
    cols = get_collections()
    
    result = await cols["reminders"].delete_one({
        "_id": reminder_id,
        "user_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8005, reload=True)

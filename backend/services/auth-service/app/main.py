"""
Auth Service
Handles authentication, JWT tokens, and 2FA
Port: 8001
"""
import os
import sys
import uuid
import pyotp
import qrcode
import io
import base64
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Add shared modules to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db, get_collections
from shared.auth import (
    verify_password, 
    get_password_hash, 
    create_access_token,
    get_current_user_id,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

app = FastAPI(title="Auth Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class TwoFAVerify(BaseModel):
    code: str


@app.on_event("startup")
async def startup():
    await connect_db()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "auth"}


@app.post("/auth/signup")
async def signup(user_data: dict = Body(...)):
    """User registration"""
    cols = get_collections()
    
    # Check if username exists
    existing = await cols["users"].find_one({"username": user_data["username"]})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check if email exists
    existing_email = await cols["users"].find_one({"email": user_data["email"]})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    # Create user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = get_password_hash(user_data["password"])
    
    new_user = {
        "_id": user_id,
        "username": user_data["username"],
        "name": user_data["name"],
        "email": user_data["email"],
        "hashed_password": hashed_password,
        "avatar": user_data["name"][0].upper(),
        "created_at": datetime.now(timezone.utc),
        "notification_keywords": [],
        "totp_enabled": False,
        "totp_secret": None,
    }
    
    await cols["users"].insert_one(new_user)
    
    # Create token
    access_token = create_access_token(
        data={"sub": user_data["username"], "user_id": user_id}
    )
    
    # Return user without password
    del new_user["hashed_password"]
    new_user["id"] = new_user.pop("_id")
    
    return TokenResponse(
        access_token=access_token,
        user=new_user
    )


@app.post("/auth/login")
async def login(credentials: dict = Body(...)):
    """User login"""
    cols = get_collections()
    
    user_doc = await cols["users"].find_one({"username": credentials["username"]})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials["password"], user_doc["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if 2FA is enabled
    if user_doc.get("totp_enabled"):
        return {"requires_2fa": True, "user_id": user_doc["_id"]}
    
    # Create token
    access_token = create_access_token(
        data={"sub": user_doc["username"], "user_id": user_doc["_id"]}
    )
    
    # Return user
    user_response = {
        "id": user_doc["_id"],
        "username": user_doc["username"],
        "name": user_doc["name"],
        "email": user_doc["email"],
        "avatar": user_doc.get("avatar", "U"),
        "created_at": user_doc["created_at"],
        "totp_enabled": user_doc.get("totp_enabled", False),
    }
    
    return TokenResponse(
        access_token=access_token,
        user=user_response
    )


@app.post("/auth/login/2fa")
async def login_with_2fa(data: dict = Body(...)):
    """Login with 2FA verification"""
    cols = get_collections()
    
    user_doc = await cols["users"].find_one({"_id": data["user_id"]})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify TOTP code
    totp = pyotp.TOTP(user_doc["totp_secret"])
    if not totp.verify(data["code"]):
        raise HTTPException(status_code=401, detail="Invalid 2FA code")
    
    # Create token
    access_token = create_access_token(
        data={"sub": user_doc["username"], "user_id": user_doc["_id"]}
    )
    
    user_response = {
        "id": user_doc["_id"],
        "username": user_doc["username"],
        "name": user_doc["name"],
        "email": user_doc["email"],
        "avatar": user_doc.get("avatar", "U"),
        "totp_enabled": True,
    }
    
    return TokenResponse(
        access_token=access_token,
        user=user_response
    )


@app.get("/auth/2fa/setup")
async def setup_2fa(user_id: str = Depends(get_current_user_id)):
    """Setup 2FA - generate secret and QR code"""
    cols = get_collections()
    
    user_doc = await cols["users"].find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate secret
    secret = pyotp.random_base32()
    
    # Store secret (not enabled yet)
    await cols["users"].update_one(
        {"_id": user_id},
        {"$set": {"totp_secret": secret}}
    )
    
    # Generate QR code
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(user_doc["email"], issuer_name="WorkMessenger")
    
    # Create QR code image
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return {
        "secret": secret,
        "qr_code_url": f"data:image/png;base64,{qr_base64}",
        "otpauth_url": uri
    }


@app.post("/auth/2fa/verify")
async def verify_2fa(data: TwoFAVerify, user_id: str = Depends(get_current_user_id)):
    """Verify and enable 2FA"""
    cols = get_collections()
    
    user_doc = await cols["users"].find_one({"_id": user_id})
    if not user_doc or not user_doc.get("totp_secret"):
        raise HTTPException(status_code=400, detail="2FA not set up")
    
    totp = pyotp.TOTP(user_doc["totp_secret"])
    if not totp.verify(data.code):
        raise HTTPException(status_code=401, detail="Invalid code")
    
    # Enable 2FA
    await cols["users"].update_one(
        {"_id": user_id},
        {"$set": {"totp_enabled": True}}
    )
    
    return {"status": "ok", "message": "2FA enabled successfully"}


@app.post("/auth/2fa/disable")
async def disable_2fa(user_id: str = Depends(get_current_user_id)):
    """Disable 2FA"""
    cols = get_collections()
    
    await cols["users"].update_one(
        {"_id": user_id},
        {"$set": {"totp_enabled": False, "totp_secret": None}}
    )
    
    return {"status": "ok", "message": "2FA disabled"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)

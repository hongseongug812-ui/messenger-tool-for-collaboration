"""
API Gateway Service
Routes all requests to appropriate microservices
Port: 8000
"""
import os
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import socketio

# Service URLs
AUTH_SERVICE = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
USER_SERVICE = os.getenv("USER_SERVICE_URL", "http://localhost:8002")
MESSAGING_SERVICE = os.getenv("MESSAGING_SERVICE_URL", "http://localhost:8003")
SERVER_SERVICE = os.getenv("SERVER_SERVICE_URL", "http://localhost:8004")
NOTIFICATION_SERVICE = os.getenv("NOTIFICATION_SERVICE_URL", "http://localhost:8005")
FILE_SERVICE = os.getenv("FILE_SERVICE_URL", "http://localhost:8006")
AI_SERVICE = os.getenv("AI_SERVICE_URL", "http://localhost:8007")

# Create FastAPI app
app = FastAPI(title="API Gateway", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO for WebSocket proxying
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Route mappings
ROUTE_MAP = {
    "/auth": AUTH_SERVICE,
    "/users": USER_SERVICE,
    "/channels": MESSAGING_SERVICE,
    "/messages": MESSAGING_SERVICE,
    "/state": SERVER_SERVICE,
    "/servers": SERVER_SERVICE,
    "/notifications": NOTIFICATION_SERVICE,
    "/reminders": NOTIFICATION_SERVICE,
    "/upload": FILE_SERVICE,
    "/files": FILE_SERVICE,
    "/ai": AI_SERVICE,
}


async def proxy_request(service_url: str, request: Request, path: str):
    """Proxy a request to a microservice"""
    async with httpx.AsyncClient() as client:
        # Build URL
        url = f"{service_url}{path}"
        
        # Get headers (forward authorization)
        headers = dict(request.headers)
        headers.pop("host", None)
        
        # Get body if present
        body = await request.body() if request.method in ["POST", "PUT", "PATCH"] else None
        
        try:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                params=request.query_params,
                timeout=30.0
            )
            
            return JSONResponse(
                content=response.json() if response.content else None,
                status_code=response.status_code
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Service unavailable: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "service": "gateway"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gateway(request: Request, path: str):
    """Main gateway route - proxies to appropriate service"""
    full_path = f"/{path}"
    
    # Find matching service
    for prefix, service_url in ROUTE_MAP.items():
        if full_path.startswith(prefix):
            return await proxy_request(service_url, request, full_path)
    
    raise HTTPException(status_code=404, detail="Route not found")


# Socket.IO Events - Proxy to Messaging Service
@sio.event
async def connect(sid, environ):
    print(f"[Gateway] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"[Gateway] Client disconnected: {sid}")


@sio.event
async def join(sid, data):
    channel_id = data.get("channelId")
    if channel_id:
        sio.enter_room(sid, channel_id)
        print(f"[Gateway] {sid} joined room {channel_id}")


@sio.event
async def leave(sid, data):
    channel_id = data.get("channelId")
    if channel_id:
        sio.leave_room(sid, channel_id)


@sio.event
async def message(sid, data):
    """Proxy message events"""
    channel_id = data.get("channelId")
    if channel_id:
        await sio.emit("message", data, room=channel_id, skip_sid=sid)


@sio.event
async def whiteboard_draw(sid, data):
    """Proxy whiteboard draw events"""
    channel_id = data.get("channelId")
    if channel_id:
        await sio.emit("whiteboard_draw", data, room=channel_id, skip_sid=sid)


@sio.event
async def whiteboard_clear(sid, data):
    """Proxy whiteboard clear events"""
    channel_id = data.get("channelId")
    if channel_id:
        await sio.emit("whiteboard_clear", data, room=channel_id, skip_sid=sid)


# Export ASGI app (includes Socket.IO)
app = socket_app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

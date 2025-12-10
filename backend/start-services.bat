@echo off
echo Starting Microservices (Local Development)
echo ==========================================

:: Start services in background
start "Auth Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.auth-service.app.main:app --host 0.0.0.0 --port 8001 --reload"
timeout /t 2

start "User Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.user-service.app.main:app --host 0.0.0.0 --port 8002 --reload"
timeout /t 2

start "Messaging Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.messaging-service.app.main:app --host 0.0.0.0 --port 8003 --reload"
timeout /t 2

start "Server Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.server-service.app.main:app --host 0.0.0.0 --port 8004 --reload"
timeout /t 2

start "Notification Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.notification-service.app.main:app --host 0.0.0.0 --port 8005 --reload"
timeout /t 2

start "File Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.file-service.app.main:app --host 0.0.0.0 --port 8006 --reload"
timeout /t 2

start "AI Service" cmd /k "cd /d %~dp0 && python -m uvicorn services.ai-service.app.main:app --host 0.0.0.0 --port 8007 --reload"
timeout /t 2

:: Start Gateway last
start "API Gateway" cmd /k "cd /d %~dp0 && python -m uvicorn services.gateway.app.main:app --host 0.0.0.0 --port 8000 --reload"

echo All services started!
echo Gateway: http://localhost:8000
echo.
pause

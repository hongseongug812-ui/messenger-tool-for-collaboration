# Work Messenger Backend (FastAPI)

Python FastAPI + Socket.IO 기반 백엔드입니다. MongoDB를 사용해 서버/카테고리/채널/메시지를 영구 저장하고, Socket.IO로 실시간 메시지 브로드캐스트를 제공합니다.

## 요구사항

- Python 3.10+
- 가상환경 권장: `python -m venv .venv && source .venv/bin/activate`
- MongoDB 5+ (로컬 또는 Atlas)

## 설치

```bash
pip install -r backend/requirements.txt
```

## 환경 변수

`.env`에 아래 값을 설정하세요.

- `MONGO_URI` (예: `mongodb://localhost:27017`)
- `MONGO_DB` (예: `work_messenger`)
- `BACKEND_CORS_ORIGINS` (콤마 구분, 예: `http://localhost:3000,http://localhost:5173`)
- `BACKEND_PORT` (선택, 기본 8000)

## 실행

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

기본 CORS 허용 도메인은 `http://localhost:3000`, `http://localhost:5173`, `http://localhost:8080`입니다. 환경변수 `BACKEND_CORS_ORIGINS`에 콤마로 구분하여 지정할 수 있습니다.

## 주요 엔드포인트

- `GET /health` 헬스 체크
- `GET /channels` 채널 목록 조회
- `POST /channels` 채널 생성 `{ "name": "새 채널", "description": "설명" }`
- `GET /channels/{channel_id}/messages` 메시지 목록
- `POST /channels/{channel_id}/messages` 메시지 생성 `{ "sender": "사용자", "content": "내용", "files": [] }`
- `GET /state` 서버/카테고리/채널 전체 구조 조회
- `POST /servers` 새 서버 생성 (기본 카테고리/채널 포함)
- `POST /servers/{serverId}/categories` 카테고리 추가
- `POST /servers/{serverId}/categories/{categoryId}/channels` 채널 추가
- `PATCH/DELETE` 카테고리/채널 수정·삭제 지원

## Socket.IO 이벤트

- `join` `{ channelId }` 채널 룸 참가
- `leave` `{ channelId }` 채널 룸 나가기
- `message` `{ channelId, message: { sender, content, files } }` 메시지 브로드캐스트 (서버가 동일 이벤트로 되돌려줍니다)

## 예시 요청

```bash
# 채널 목록
curl http://localhost:8000/channels

# 메시지 전송
curl -X POST http://localhost:8000/channels/channel_1/messages \
  -H "Content-Type: application/json" \
  -d '{ "sender": "사용자", "content": "안녕하세요!" }'
```

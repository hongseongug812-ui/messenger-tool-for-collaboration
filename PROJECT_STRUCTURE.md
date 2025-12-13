# Work Messenger 프로젝트 구조 분석

## 📋 프로젝트 개요

**Work Messenger**는 업무용 데스크톱 메신저 애플리케이션입니다. Electron 기반 프론트엔드와 FastAPI 기반 마이크로서비스 아키텍처 백엔드로 구성되어 있습니다.

---

## 🏗️ 전체 아키텍처

### 기술 스택
- **프론트엔드**: Electron (Node.js), Vanilla JavaScript (ES6 Modules)
- **백엔드**: Python FastAPI, 마이크로서비스 아키텍처
- **데이터베이스**: MongoDB (Motor - 비동기 드라이버)
- **실시간 통신**: Socket.IO
- **컨테이너화**: Docker, Docker Compose

---

## 📁 디렉토리 구조

```
Messenger-tool-for-collaboration/
├── src/                          # Electron 프론트엔드
│   ├── main.js                   # Electron 메인 프로세스
│   ├── preload.js                # 보안 브릿지 (IPC, Socket.IO)
│   └── renderer/                 # 렌더러 프로세스 (UI)
│       ├── index.html            # 메인 HTML
│       ├── app.js                # 메인 애플리케이션 로직
│       ├── styles.css            # 스타일시트
│       ├── screen-share.css      # 화면 공유 스타일
│       └── modules/              # 기능별 모듈
│           ├── AuthManager.js    # 인증 관리
│           ├── ChatManager.js    # 채팅 관리
│           ├── NotepadManager.js # 메모장 관리
│           ├── ServerManager.js  # 서버/채널 관리
│           ├── SocketManager.js  # Socket.IO 연결 관리
│           ├── UIManager.js      # UI 상태 관리
│           ├── WebRTCManager.js  # 화면 공유/WebRTC
│           └── WhiteboardManager.js # 화이트보드
│
├── backend/                      # 백엔드 서비스
│   ├── app/                      # 레거시 단일 서버 (main.py)
│   ├── services/                 # 마이크로서비스
│   │   ├── gateway/              # API Gateway (포트 8000)
│   │   │   └── app/main.py       # 라우팅 및 프록시
│   │   ├── auth-service/         # 인증 서비스 (포트 8001)
│   │   │   ├── app/main.py
│   │   │   └── routes/           # 인증 라우트
│   │   ├── user-service/         # 사용자 서비스 (포트 8002)
│   │   │   ├── app/main.py
│   │   │   └── routes/
│   │   ├── messaging-service/    # 메시징 서비스 (포트 8003)
│   │   │   ├── app/main.py
│   │   │   └── routes/
│   │   ├── server-service/       # 서버/채널 서비스 (포트 8004)
│   │   │   ├── app/main.py
│   │   │   └── routes/
│   │   ├── notification-service/ # 알림 서비스 (포트 8005)
│   │   │   ├── app/main.py
│   │   │   └── routes/
│   │   ├── file-service/         # 파일 서비스 (포트 8006)
│   │   │   └── app/main.py
│   │   └── ai-service/           # AI 서비스 (포트 8007)
│   │       └── app/main.py
│   │
│   ├── shared/                   # 공유 모듈
│   │   ├── models.py             # Pydantic 모델 (User, Message, Server 등)
│   │   ├── database.py           # MongoDB 연결 관리
│   │   ├── auth.py               # 인증 유틸리티
│   │   └── encryption.py       # 암호화 유틸리티
│   │
│   ├── docker-compose.yml        # Docker Compose 설정
│   ├── requirements.txt          # Python 의존성
│   ├── start-services.bat       # 서비스 시작 스크립트
│   └── README.md                 # 백엔드 문서
│
├── testsprite_tests/             # 테스트 파일
│   ├── TC001_*.py ~ TC006_*.py   # 테스트 케이스
│   └── tmp/                      # 테스트 결과
│
├── uploads/                      # 업로드된 파일 저장소
│
├── package.json                  # Node.js 프로젝트 설정
├── package-lock.json
└── README.md                     # 프로젝트 메인 문서
```

---

## 🔧 주요 컴포넌트 상세

### 1. 프론트엔드 (Electron)

#### `src/main.js` - 메인 프로세스
- Electron 앱 초기화
- 브라우저 윈도우 생성 및 관리
- 시스템 트레이 아이콘
- IPC 핸들러 등록
- 데스크톱 알림
- 화면 캡처 API

#### `src/preload.js` - 보안 브릿지
- Context Isolation을 통한 보안
- Socket.IO 클라이언트 로딩 및 관리
- Markdown 파서 (marked)
- IPC API 노출 (`window.electronAPI`)
- Socket.IO 이벤트 프록시

#### `src/renderer/app.js` - 메인 애플리케이션
- `WorkMessenger` 클래스: 전체 앱 오케스트레이션
- Manager 인스턴스 초기화 및 조율
- API 요청 중앙 관리
- 전역 이벤트 바인딩

#### 프론트엔드 모듈 (`src/renderer/modules/`)

**AuthManager.js**
- 사용자 인증 (로그인/회원가입)
- JWT 토큰 관리
- 로그인 상태 유지
- 2FA 지원

**SocketManager.js**
- Socket.IO 연결 관리
- 실시간 이벤트 수신/발신
- 재연결 로직

**ChatManager.js**
- 메시지 전송/수신
- 메시지 렌더링
- 파일 첨부
- 스레드/답글 기능

**ServerManager.js**
- 서버/카테고리/채널 구조 관리
- 서버 생성/수정/삭제
- 채널 이동/정렬

**UIManager.js**
- 모달 관리
- 테마 전환
- 토스트 알림
- UI 상태 관리

**WebRTCManager.js**
- 화면 공유 기능
- WebRTC 연결 관리
- 원격 화면 표시

**WhiteboardManager.js**
- 화이트보드 기능
- 그리기 도구

**NotepadManager.js**
- 메모장 기능

---

### 2. 백엔드 (FastAPI 마이크로서비스)

#### API Gateway (`backend/services/gateway/`)
- **포트**: 8000
- 모든 클라이언트 요청의 진입점
- 서비스별 라우팅 및 프록시
- Socket.IO 이벤트 프록시
- CORS 처리

#### Auth Service (`backend/services/auth-service/`)
- **포트**: 8001
- 사용자 인증 (로그인/회원가입)
- JWT 토큰 발급
- 비밀번호 해싱 (bcrypt)
- 2FA (TOTP) 지원

#### User Service (`backend/services/user-service/`)
- **포트**: 8002
- 사용자 프로필 관리
- 사용자 정보 CRUD

#### Messaging Service (`backend/services/messaging-service/`)
- **포트**: 8003
- 메시지 CRUD
- Socket.IO를 통한 실시간 메시지 브로드캐스트
- 메시지 암호화

#### Server Service (`backend/services/server-service/`)
- **포트**: 8004
- 서버/카테고리/채널 구조 관리
- 서버 멤버 관리
- 권한 관리

#### Notification Service (`backend/services/notification-service/`)
- **포트**: 8005
- 알림 생성/관리
- 키워드 알림
- 멘션 알림
- 리마인더

#### File Service (`backend/services/file-service/`)
- **포트**: 8006
- 파일 업로드/다운로드
- 파일 저장소 관리

#### AI Service (`backend/services/ai-service/`)
- **포트**: 8007
- Google Gemini API 통합
- AI 기능 제공

#### 공유 모듈 (`backend/shared/`)

**models.py**
- Pydantic 모델 정의:
  - `User`, `UserSignup`, `UserLogin`
  - `Message`, `MessageCreate`
  - `Server`, `Category`, `Channel`
  - `Notification`, `Reminder`

**database.py**
- MongoDB 연결 관리 (Motor)
- 컬렉션 초기화:
  - `users`, `servers`, `messages`
  - `notifications`, `reminders`
  - `bookmarks`, `audit_logs`
  - `password_reset_tokens`, `user_sessions`

**auth.py**
- JWT 토큰 생성/검증
- 비밀번호 해싱/검증

**encryption.py**
- 메시지 암호화/복호화

---

## 🔌 통신 구조

### HTTP API
- 클라이언트 → API Gateway (포트 8000)
- Gateway → 각 마이크로서비스 (포트 8001-8007)

### WebSocket (Socket.IO)
- 클라이언트 ↔ Gateway (포트 8000)
- Gateway ↔ Messaging Service (포트 8003)
- 실시간 메시지 브로드캐스트

### 데이터 흐름
```
클라이언트 (Electron)
    ↓ HTTP/Socket.IO
API Gateway (8000)
    ↓ HTTP
각 마이크로서비스 (8001-8007)
    ↓
MongoDB
```

---

## 🗄️ 데이터베이스 구조

### MongoDB 컬렉션

1. **users**: 사용자 계정 정보
2. **servers**: 서버 및 카테고리/채널 구조
3. **messages**: 채팅 메시지
4. **notifications**: 알림
5. **reminders**: 리마인더
6. **bookmarks**: 북마크
7. **audit_logs**: 감사 로그
8. **password_reset_tokens**: 비밀번호 재설정 토큰
9. **user_sessions**: 사용자 세션

---

## 🚀 실행 방법

### 백엔드
```bash
# Docker Compose로 모든 서비스 실행
cd backend
docker-compose up -d

# 또는 개별 실행
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 프론트엔드
```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 빌드
npm run build:win  # Windows
npm run build:mac  # macOS
npm run build:linux # Linux
```

---

## 📦 의존성

### 프론트엔드 (`package.json`)
- `electron`: ^39.2.4
- `socket.io-client`: ^4.7.2
- `marked`: ^17.0.1
- `dompurify`: ^3.3.0
- `dotenv`: ^16.3.1

### 백엔드 (`backend/requirements.txt`)
- `fastapi`: >=0.104.0
- `uvicorn`: >=0.24.0
- `motor`: >=3.3.0 (MongoDB 비동기 드라이버)
- `python-socketio`: >=5.10.0
- `python-jose`: >=3.3.0 (JWT)
- `passlib[bcrypt]`: >=1.7.4 (비밀번호 해싱)
- `cryptography`: >=41.0.0
- `google-generativeai`: >=0.3.0 (Gemini AI)
- `pydantic`: >=2.5.0

---

## 🔐 보안 기능

1. **Context Isolation**: Electron 보안 모델
2. **JWT 인증**: 토큰 기반 인증
3. **비밀번호 해싱**: bcrypt
4. **메시지 암호화**: 선택적 메시지 암호화
5. **2FA**: TOTP 기반 2단계 인증
6. **CORS**: 백엔드 CORS 설정

---

## 🎨 UI/UX 특징

- 다크 테마 기본
- 미니멀 디자인
- 시스템 트레이 지원
- 데스크톱 알림
- 방해금지 모드
- 커스텀 타이틀바
- 전체화면 모드

---

## 📝 주요 기능

1. **인증**
   - 회원가입/로그인
   - 로그인 상태 유지
   - 2FA 지원
   - 비밀번호 재설정

2. **메시징**
   - 실시간 채팅
   - 파일 첨부
   - 스레드/답글
   - 메시지 수정/삭제
   - 반응(이모지)
   - 멘션

3. **서버/채널 관리**
   - 서버 생성/관리
   - 카테고리/채널 구조
   - 채널 이동/정렬
   - 권한 관리

4. **협업 기능**
   - 화면 공유 (WebRTC)
   - 화이트보드
   - 메모장

5. **알림**
   - 키워드 알림
   - 멘션 알림
   - 리마인더

6. **AI 기능**
   - Google Gemini 통합

---

## 🧪 테스트

테스트 파일은 `testsprite_tests/` 디렉토리에 있습니다:
- TC001: 사용자 등록 (유효한 데이터)
- TC002: 사용자 등록 (누락된 필드)
- TC003: 로그인 (올바른 자격증명)
- TC004: 로그인 (잘못된 자격증명)
- TC005: 서버 목록 조회
- TC006: 서버 생성 (유효한 데이터)

---

## 📌 참고사항

1. **레거시 코드**: `backend/app/main.py`는 단일 서버 버전으로 보이며, 현재는 마이크로서비스 아키텍처로 전환 중인 것으로 보입니다.

2. **환경 변수**: `.env` 파일에 다음 설정이 필요합니다:
   - `MONGO_URI`: MongoDB 연결 URI
   - `MONGO_DB`: 데이터베이스 이름
   - `JWT_SECRET`: JWT 시크릿 키
   - `ENCRYPTION_KEY`: 암호화 키
   - `GOOGLE_API_KEY`: Gemini API 키 (선택)

3. **Docker**: 모든 서비스를 Docker Compose로 실행할 수 있습니다.

4. **크로스 플랫폼**: Windows, macOS, Linux 지원

---

## 🔄 개발 워크플로우

1. 백엔드 서비스 시작 (Docker Compose 또는 개별 실행)
2. 프론트엔드 개발 서버 실행 (`npm run dev`)
3. MongoDB 연결 확인
4. Socket.IO 연결 확인
5. 기능 테스트

---

이 문서는 프로젝트의 전체 구조를 개괄적으로 설명합니다. 더 자세한 정보는 각 디렉토리의 README 파일을 참조하세요.


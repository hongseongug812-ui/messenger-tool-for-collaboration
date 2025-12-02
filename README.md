# Work Messenger 💬

업무에 집중할 수 있는 깔끔한 디자인의 데스크톱 메신저 앱

![Electron](https://img.shields.io/badge/Electron-28.0-47848F?logo=electron)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

## ✨ 특징

- **깔끔한 다크 테마** - 눈의 피로를 줄이고 업무에 집중
- **미니멀 디자인** - 불필요한 요소 없이 핵심 기능에 집중
- **시스템 트레이** - 닫아도 백그라운드에서 실행
- **데스크톱 알림** - 새 메시지 알림
- **방해금지 모드** - 집중이 필요할 때 알림 차단
- **크로스 플랫폼** - Windows, macOS, Linux 지원

## 🚀 시작하기

### 필수 조건

- Node.js 18+
- npm 또는 yarn
- Python 3.10+
- MongoDB 5+ (로컬 또는 Atlas)

### 설치 및 실행

#### 1) 백엔드 (FastAPI + MongoDB)
```bash
# 가상환경 생성 (선택)
python -m venv .venv && source .venv/bin/activate

# 백엔드 의존성 설치
pip install -r backend/requirements.txt

# .env 설정 후 실행 (기본 포트 8000)
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2) 프런트(데스크톱 앱)
```bash
# 저장소 클론
git clone <repository-url>
cd work-messenger

# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 또는 일반 실행
npm start
```

### 빌드 (데스크톱 앱 패키징)

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## ⚙️ 환경 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 설정을 입력하세요.

```bash
cp .env.example .env
```

### 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `SERVER_URL` | 백엔드 기본 URL | `http://localhost:8000` |
| `SOCKET_PORT` | Socket.IO 포트 | `8000` |
| `BACKEND_PORT` | 백엔드 리슨 포트 | `8000` |
| `BACKEND_CORS_ORIGINS` | CORS 허용 도메인(콤마 구분) | `http://localhost:3000,http://localhost:5173,http://localhost:8080` |
| `MONGO_URI` | MongoDB 연결 URI | `mongodb://localhost:27017` |
| `MONGO_DB` | MongoDB DB 이름 | `work_messenger` |
| `API_KEY` | API 인증 키 (선택) | - |
| `API_SECRET` | API 시크릿 (선택) | - |
| `ENCRYPTION_KEY` | 메시지 암호화 키 (32자) | - |
| `PUSH_ENABLED` | 푸시 알림 활성화 | `true` |
| `PUSH_SOUND` | 알림 소리 | `true` |
| `DEBUG_MODE` | 개발자 도구 표시 | `false` |

## 📁 프로젝트 구조

```
work-messenger/
├── src/
│   ├── main.js           # Electron 메인 프로세스
│   ├── preload.js        # 보안 브릿지
│   └── renderer/
│       ├── index.html    # 메인 UI
│       ├── styles.css    # 스타일
│       └── app.js        # 렌더러 로직
├── backend/
│   ├── app/              # FastAPI + Socket.IO 백엔드
│   └── requirements.txt
├── assets/               # 아이콘 등 리소스
├── .env.example          # 환경 변수 예시
└── package.json
```

## 🎨 디자인 시스템

### 색상

```css
--bg-primary: #0a0a0f;      /* 메인 배경 */
--bg-secondary: #12121a;    /* 보조 배경 */
--accent: #6366f1;          /* 강조색 (인디고) */
--text-primary: #f0f0f5;    /* 기본 텍스트 */
--text-secondary: #8888a0;  /* 보조 텍스트 */
```

### 폰트

- **본문**: IBM Plex Sans KR
- **코드**: JetBrains Mono

## ⌨️ 단축키

| 단축키 | 기능 |
|--------|------|
| `Enter` | 메시지 전송 |
| `Shift + Enter` | 줄바꿈 |
| `Ctrl/Cmd + K` | 검색 |
| `Esc` | 모달 닫기 |

## 🔌 서버 연결

기본적으로 FastAPI 백엔드와 MongoDB를 사용해 서버/카테고리/채널/메시지를 영구 저장하고 Socket.IO로 동기화합니다.

1. `.env`에 백엔드/Mongo 설정을 입력하고 백엔드를 실행합니다.
2. 프런트 `.env`의 `SERVER_URL`/`SOCKET_PORT`를 백엔드 포트(기본 8000)로 맞춥니다.
3. 앱 실행 후 새로운 서버/채널/메시지가 MongoDB(`work_messenger` DB, `servers`/`messages` 컬렉션)에 저장되고 Socket.IO로 실시간 반영됩니다.

### 메시지 프로토콜 (Socket.IO 예시)

```javascript
// 메시지 전송
socket.emit('message', {
  channelId: 'channel_id',
  message: {
    sender: { id: 'user1', name: '사용자', avatar: 'U' },
    content: '메시지 내용',
    files: []
  }
});

// 메시지 수신
socket.on('message', (data) => {
  // { channelId, message }
});
```

## 📝 라이선스

MIT License

## 🤝 기여

이슈와 풀 리퀘스트를 환영합니다!

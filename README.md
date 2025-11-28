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

- Node.js 18 이상
- npm 또는 yarn

### 설치

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

### 빌드

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
| `SERVER_URL` | 메신저 서버 URL | `http://localhost:3000` |
| `SOCKET_PORT` | 소켓 포트 | `3000` |
| `API_KEY` | API 인증 키 | - |
| `API_SECRET` | API 시크릿 | - |
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

현재는 데모 데이터로 동작합니다. 실제 서버와 연결하려면:

1. `app.js`에서 `connectSocket()` 메서드의 주석을 해제
2. `.env`에 서버 정보 입력
3. Socket.IO 기반 서버 구현

### 메시지 프로토콜 (예시)

```javascript
// 메시지 전송
socket.emit('message', {
  chatId: 'chat_id',
  content: '메시지 내용',
  timestamp: Date.now()
});

// 메시지 수신
socket.on('message', (data) => {
  // { chatId, sender, content, timestamp }
});
```

## 📝 라이선스

MIT License

## 🤝 기여

이슈와 풀 리퀘스트를 환영합니다!

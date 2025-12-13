# 아키텍처 문서

## 레이어드 아키텍처 (Layered Architecture)

이 프로젝트는 관심사 분리와 SOLID 원칙을 준수하는 레이어드 아키텍처를 따릅니다.

### 레이어 구조

```
src/renderer/modules/
├── infrastructure/          # Infrastructure Layer (외부 통신)
│   └── socket/             # Socket.IO 연결 및 이벤트 관리
│       ├── SocketConnection.js      # 연결 관리
│       ├── SocketEventDispatcher.js # 이벤트 발행
│       └── SocketEventHandler.js     # 이벤트 리스너 등록
│
├── domain/                 # Domain Layer (비즈니스 규칙)
│   └── policy/             # 권한 정책
│       ├── PermissionPolicy.js      # 역할 기반 권한
│       ├── ChannelPolicy.js         # 채널 접근/게시 권한
│       └── ServerPolicy.js          # 서버 관리 권한
│
├── application/            # Application Layer (유스케이스)
│   └── services/           # 애플리케이션 서비스
│       └── PermissionService.js     # 권한 체크 서비스
│
└── [기존 Manager들]        # Presentation Layer (UI)
    ├── SocketManager.js    # Socket Facade
    ├── ServerManager.js    # 서버 관리
    ├── ChatManager.js      # 채팅 관리
    └── ...
```

## SOLID 원칙 적용

### Single Responsibility Principle (SRP)
- **SocketConnection**: Socket 연결 관리만 담당
- **SocketEventDispatcher**: 이벤트 발행만 담당
- **SocketEventHandler**: 이벤트 리스너 등록만 담당
- **PermissionPolicy**: 역할 기반 권한 체크만 담당
- **ChannelPolicy**: 채널 권한 체크만 담당
- **ServerPolicy**: 서버 권한 체크만 담당

### Open/Closed Principle (OCP)
- **SocketEventHandler**: 새로운 이벤트 핸들러 추가 가능 (확장에 열림)
- **PermissionPolicy**: 새로운 권한 타입 추가 가능 (확장에 열림)
- 기존 코드 수정 없이 새로운 기능 추가 가능

### Dependency Inversion Principle (DIP)
- **SocketManager**: Infrastructure Layer의 추상화에 의존
- **PermissionService**: Domain Layer의 Policy에 의존
- **ServerManager/ChatManager**: Application Layer의 Service에 의존

## DRY 원칙 적용

### 중복 제거
- **Socket 이벤트 핸들러**: `SocketEventHandler`로 통합 관리
- **권한 체크 로직**: `PermissionService`로 중앙화
- **연결 상태 UI 업데이트**: `updateConnectionStatus` 메서드로 통합

## 모듈 설명

### Infrastructure Layer

#### SocketConnection
- Socket.IO 연결 생성 및 관리
- 연결 상태 추적

#### SocketEventDispatcher
- 이벤트 발행 (`emit`)
- 일괄 이벤트 발행 (`emitBatch`)

#### SocketEventHandler
- 이벤트 리스너 등록 (`on`)
- 이벤트 리스너 해제 (`off`)
- 모든 리스너 해제 (`removeAllListeners`)

### Domain Layer

#### PermissionPolicy
- 역할 기반 권한 체크 (`hasRole`, `isAdmin`, `isOwner`)
- 권한 레벨 비교 (`compareRole`)

#### ChannelPolicy
- 채널 접근 권한 (`canAccess`)
- 채널 게시 권한 (`canPost`)
- 채널 수정/삭제 권한 (`canModify`, `canDelete`)

#### ServerPolicy
- 서버 멤버 확인 (`isMember`)
- 사용자 역할 조회 (`getUserRole`)
- 서버 관리 권한 (`canModify`, `canDelete`, `canManageMembers`)
- 카테고리/채널 생성 권한 (`canCreateCategory`, `canCreateChannel`)

### Application Layer

#### PermissionService
- Domain Policy를 사용하여 권한 체크
- 비즈니스 로직과 Domain 로직 연결

### Presentation Layer

#### SocketManager (Facade)
- Infrastructure Layer의 Socket 모듈들을 통합 관리
- 애플리케이션에서 사용하기 쉬운 인터페이스 제공

## 사용 예시

### Socket 사용
```javascript
// SocketManager는 Infrastructure Layer를 사용
const socketManager = new SocketManager(app);
socketManager.connect();
socketManager.emit('message', { content: 'Hello' });
```

### Policy 사용
```javascript
// PermissionService를 통해 권한 체크
const permissionService = new PermissionService();
const canPost = permissionService.canPostInChannel(channel, server, userId);
```

## 확장성

### 새로운 Socket 이벤트 추가
1. `SocketEventHandler.on()`으로 리스너 등록
2. 기존 코드 수정 불필요 (OCP)

### 새로운 권한 타입 추가
1. `PermissionPolicy`에 새로운 메서드 추가
2. `PermissionService`에서 사용
3. 기존 Policy 수정 불필요 (OCP)

## 의존성 방향

```
Presentation Layer (Managers)
    ↓
Application Layer (Services)
    ↓
Domain Layer (Policies)
    ↓
Infrastructure Layer (Socket, API)
```

- 상위 레이어는 하위 레이어에 의존
- 하위 레이어는 상위 레이어를 알지 못함
- 인터페이스를 통한 의존성 역전 (DIP)


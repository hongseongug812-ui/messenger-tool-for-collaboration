# WebRTC 모듈 - SOLID 원칙 적용

이 디렉토리는 SOLID 원칙에 따라 리팩토링된 WebRTC 관련 클래스들을 포함합니다.

## 구조

### 클래스 분리 (Single Responsibility Principle)

1. **PeerConnectionManager.js**
   - **책임**: RTCPeerConnection 생성, 관리, 종료
   - **역할**: Peer Connection의 생명주기 관리

2. **MediaStreamManager.js**
   - **책임**: 로컬/원격 미디어 스트림 관리
   - **역할**: 스트림 저장, 조회, 정리

3. **SignalingHandler.js**
   - **책임**: WebRTC 시그널링 처리 (Offer/Answer/ICE Candidate)
   - **역할**: 시그널링 프로토콜 처리

4. **ScreenShareManager.js**
   - **책임**: 화면 공유 시작/종료 및 스트림 관리
   - **역할**: 화면 공유 기능 전담

5. **WebRTCUIController.js**
   - **책임**: WebRTC 관련 UI 업데이트
   - **역할**: UI 렌더링 및 이벤트 처리

### Facade 패턴 (WebRTCManager)

`WebRTCManager`는 Facade 패턴을 사용하여 위 클래스들을 조율합니다:
- 복잡한 내부 구조를 단순한 인터페이스로 제공
- 기존 코드와의 호환성 유지
- 각 매니저 클래스에 작업을 위임

## SOLID 원칙 적용

### 1. Single Responsibility Principle (SRP)
각 클래스는 하나의 책임만 가집니다:
- `PeerConnectionManager`: Peer Connection 관리만
- `MediaStreamManager`: 스트림 관리만
- `SignalingHandler`: 시그널링 처리만
- `ScreenShareManager`: 화면 공유만
- `WebRTCUIController`: UI 업데이트만

### 2. Open/Closed Principle (OCP)
- 새로운 기능 추가 시 기존 클래스 수정 없이 확장 가능
- 예: 새로운 시그널링 프로토콜 추가 시 `SignalingHandler`만 확장

### 3. Liskov Substitution Principle (LSP)
- 인터페이스 기반 설계로 구현체 교체 가능
- 예: 다른 Peer Connection 구현체로 교체 가능

### 4. Interface Segregation Principle (ISP)
- 클라이언트가 사용하지 않는 메서드에 의존하지 않음
- 각 매니저는 필요한 메서드만 노출

### 5. Dependency Inversion Principle (DIP)
- 고수준 모듈이 저수준 모듈에 의존하지 않음
- 의존성 주입을 통해 결합도 감소
- 예: `WebRTCManager`가 매니저들을 주입받아 사용

## 사용 예제

```javascript
// WebRTCManager는 Facade로 작동
const webRTCManager = new WebRTCManager(app);

// 내부적으로는 각 매니저가 작업을 처리
webRTCManager.startScreenShare(); // ScreenShareManager에 위임
webRTCManager.showRemoteScreenShare(userId, stream); // UIController에 위임
```

## 장점

1. **유지보수성 향상**: 각 클래스의 책임이 명확하여 수정이 용이
2. **테스트 용이성**: 각 클래스를 독립적으로 테스트 가능
3. **확장성**: 새로운 기능 추가 시 기존 코드 수정 최소화
4. **재사용성**: 각 매니저를 다른 컨텍스트에서도 사용 가능

## 향후 개선 사항

- [ ] 인터페이스 정의로 더 강한 추상화
- [ ] 이벤트 기반 아키텍처로 결합도 추가 감소
- [ ] 단위 테스트 추가
- [ ] 타입 정의 (TypeScript 전환 고려)


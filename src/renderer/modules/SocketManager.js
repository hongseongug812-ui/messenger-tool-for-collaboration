import { SocketConnection, SocketEventDispatcher, SocketEventHandler } from './infrastructure/socket/index.js';

/**
 * SocketManager - Application Layer (Facade)
 * SRP: Socket 관련 기능을 통합 관리하는 Facade
 * DIP: Infrastructure Layer의 추상화에 의존
 * 레이어드 아키텍처: Application Layer
 */
export class SocketManager {
    constructor(app) {
        this.app = app;
        // Infrastructure Layer 의존성 주입
        this.connection = new SocketConnection(this.apiBase, null);
        this.dispatcher = new SocketEventDispatcher();
        this.eventHandler = new SocketEventHandler();
    }

    get apiBase() {
        return this.app.apiBase;
    }

    connect() {
        console.log('[SocketManager] connect 호출됨');

        if (!window.electronAPI || !this.apiBase) {
            console.log('[SocketManager] 조기 반환: electronAPI 또는 apiBase 누락');
            this.updateConnectionStatus('서버 설정 필요', false);
            return;
        }

        // Infrastructure Layer를 통한 연결
        const token = this.app.auth.authToken;
        this.connection.token = token;
        const connected = this.connection.connect();

        if (!connected) {
            this.updateConnectionStatus('연결 실패', false);
            return;
        }

        try {
            // 이벤트 핸들러 등록 (Infrastructure Layer 사용)
            this.setupEventHandlers();

            // Re-join channels on connect if any selected?
            // Actually ServerManager or ChatManager should handle re-joining if needed.
            // But 'join' event is needed for online status and receiving messages.

        } catch (error) {
            console.error('[SocketManager] 소켓 연결 실패:', error);
            this.updateConnectionStatus('연결 오류', false);
        }
    }

    /**
     * 이벤트 핸들러 설정 (DRY: 중복 제거)
     */
    setupEventHandlers() {
        // 연결 상태 이벤트
        this.eventHandler.on('connect', () => {
            console.log('[SocketManager] 연결됨');
            this.connection.setConnectionState(true);
            this.updateConnectionStatus('연결됨', true);

            // 재연결 시 데이터 새로고침
            if (this.app.auth.isAuthenticated) {
                this.app.serverManager.fetchUnreadCounts();
            }

            // WebRTC 시그널링 리스너 재설정
            if (this.app.webRTCManager) {
                this.app.webRTCManager.setupSignalingListeners();
            }
        });

        this.eventHandler.on('disconnect', () => {
            console.log('[SocketManager] 연결 끊김');
            this.connection.setConnectionState(false);
            this.updateConnectionStatus('연결 끊김', false);
        });

        this.eventHandler.on('connect_error', (error) => {
            console.error('[SocketManager] 연결 오류:', error);
            this.connection.setConnectionState(false);
            this.updateConnectionStatus('연결 오류', false);
        });

        // 채팅 이벤트 - EventBus를 통해 발행 (결합도 감소)
        this.eventHandler.on('message', (data) => {
            this.app.eventBus.emit('MESSAGE_RECEIVED', data);
        });

        this.eventHandler.on('notification', (data) => {
            this.app.eventBus.emit('NOTIFICATION_RECEIVED', data);
        });

        this.eventHandler.on('message_deleted', (data) => {
            this.app.eventBus.emit('MESSAGE_DELETED', data);
        });

        this.eventHandler.on('typing_start', (data) => {
            this.app.eventBus.emit('TYPING_START', data);
        });

        this.eventHandler.on('typing_stop', (data) => {
            this.app.eventBus.emit('TYPING_STOP', data);
        });

        this.eventHandler.on('user_read_update', (data) => {
            this.app.eventBus.emit('USER_READ_UPDATE', data);
        });

        this.eventHandler.on('reminder_notification', (data) => {
            this.app.eventBus.emit('REMINDER_NOTIFICATION', data);
        });

        this.eventHandler.on('poll_vote', (data) => {
            this.app.eventBus.emit('POLL_VOTE', data);
        });

        this.eventHandler.on('reaction_added', (data) => {
            this.app.eventBus.emit('REACTION_ADDED', data);
        });

        this.eventHandler.on('reaction_removed', (data) => {
            this.app.eventBus.emit('REACTION_REMOVED', data);
        });

        // 서버 이벤트 - EventBus를 통해 발행
        this.eventHandler.on('member_joined', (data) => {
            this.app.eventBus.emit('MEMBER_JOINED', data);
        });

        this.eventHandler.on('member_left', (data) => {
            this.app.eventBus.emit('MEMBER_LEFT', data);
        });

        this.eventHandler.on('user_status_changed', (data) => {
            this.app.eventBus.emit('USER_STATUS_CHANGED', data);
        });

        this.eventHandler.on('voice_state_update', (data) => {
            console.log('[SocketManager] voice_state_update received:', data);
            this.app.eventBus.emit('VOICE_STATE_UPDATE', data);
        });

        // Note: webrtc_answer is handled ONLY in WebRTCManager.setupSignalingListeners()
        // to avoid duplicate processing which breaks the signaling state machine.
        // The handlers below were causing issues because handleAnswer was called multiple times.
        // DO NOT add webrtc_answer handler here!


        this.eventHandler.on('screen_share_started', async (data) => {
            console.log('[SocketManager] screen_share_started received:', data);
            const channelId = this.app.serverManager.currentChannel?.id;
            if (channelId) {
                this.app.serverManager.updateParticipantScreenShare(channelId, data.userId, true);
            }

            // P2P 연결 생성 시도
            if (this.app.webRTCManager && data.callerId && !this.app.webRTCManager.peerConnectionManager.exists(data.callerId)) {
                console.log('[SocketManager] Creating peer connection to screen sharer:', data.callerId);
                await this.app.webRTCManager.createPeerConnection(data.callerId, false);
            }
        });

        this.eventHandler.on('user_joined', async (data) => {
            console.log('[SocketManager] user_joined received:', data);
            const channelId = data.channelId;
            const participants = data.participants || [];

            if (channelId) {
                this.app.serverManager.updateVoiceParticipants(channelId, participants);
            }

            // P2P 연결 생성 시도
            if (this.app.webRTCManager && data.callerId && this.app.webRTCManager.isCallActive && !this.app.webRTCManager.peerConnectionManager.exists(data.callerId)) {
                console.log('[SocketManager] Creating peer connection to new user:', data.callerId);
                await this.app.webRTCManager.createPeerConnection(data.callerId, true);
            }
        });
    }

    /**
     * 연결 상태 UI 업데이트 (DRY: 중복 제거)
     * @param {string} message - 상태 메시지
     * @param {boolean} connected - 연결 여부
     */
    updateConnectionStatus(message, connected) {
        const statusText = document.getElementById('connection-status');
        if (statusText) {
            const statusClass = connected ? 'connected' : 'disconnected';
            statusText.innerHTML = `<span class="status-dot ${statusClass}"></span> ${message}`;
        }
    }

    /**
     * Socket 연결 해제
     */
    disconnect() {
        this.connection.disconnect();
        this.eventHandler.removeAllListeners();
    }

    /**
     * 이벤트 발행 (Facade 패턴)
     * @param {string} event - 이벤트 이름
     * @param {any} data - 이벤트 데이터
     */
    emit(event, data) {
        this.dispatcher.emit(event, data);
    }
}

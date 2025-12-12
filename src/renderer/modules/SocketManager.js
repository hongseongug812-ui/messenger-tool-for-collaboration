export class SocketManager {
    constructor(app) {
        this.app = app;
    }

    get apiBase() {
        return this.app.apiBase;
    }

    connect() {
        console.log('[SocketManager] connect 호출됨');

        if (!window.electronAPI || !this.apiBase) {
            console.log('[SocketManager] 조기 반환: electronAPI 또는 apiBase 누락');
            const statusText = document.getElementById('connection-status');
            if (statusText) {
                statusText.innerHTML = '<span class="status-dot disconnected"></span> 서버 설정 필요';
            }
            return;
        }

        if (!window.electronAPI.connectSocket) {
            console.error('[SocketManager] electronAPI.connectSocket이 정의되지 않음');
            return;
        }

        try {
            // 소켓 연결
            const token = this.app.auth.authToken;
            window.electronAPI.connectSocket(this.apiBase, token);

            // Re-join channels on connect if any selected?
            // Actually ServerManager or ChatManager should handle re-joining if needed.
            // But 'join' event is needed for online status and receiving messages.

            // 연결 상태 리스너
            window.electronAPI.onSocketEvent('connect', () => {
                console.log('[SocketManager] 연결됨');
                const statusText = document.getElementById('connection-status');
                if (statusText) {
                    statusText.innerHTML = '<span class="status-dot connected"></span> 연결됨';
                }

                // 재연결 시 데이터 새로고침
                if (this.app.auth.isAuthenticated) {
                    this.app.serverManager.fetchUnreadCounts();
                }
            });

            window.electronAPI.onSocketEvent('disconnect', () => {
                console.log('[SocketManager] 연결 끊김');
                const statusText = document.getElementById('connection-status');
                if (statusText) {
                    statusText.innerHTML = '<span class="status-dot disconnected"></span> 연결 끊김';
                }
            });

            window.electronAPI.onSocketEvent('connect_error', (error) => {
                console.error('[SocketManager] 연결 오류:', error);
                const statusText = document.getElementById('connection-status');
                if (statusText) {
                    statusText.innerHTML = '<span class="status-dot disconnected"></span> 연결 오류';
                }
            });

            // 이벤트 리스너 등록
            window.electronAPI.onSocketEvent('message', (data) => {
                this.app.chatManager.handleMessageReceived(data);
            });

            window.electronAPI.onSocketEvent('notification', (data) => {
                this.app.chatManager.handleNotificationReceived(data);
            });

            window.electronAPI.onSocketEvent('member_joined', (data) => {
                this.app.serverManager.handleMemberJoined(data);
            });

            window.electronAPI.onSocketEvent('member_left', (data) => {
                this.app.serverManager.handleMemberLeft(data);
            });

            window.electronAPI.onSocketEvent('user_status_changed', (data) => {
                this.app.serverManager.handleUserStatusChanged(data);
            });

            window.electronAPI.onSocketEvent('poll_vote', (data) => {
                this.app.chatManager.applyPollVote(data);
            });

            window.electronAPI.onSocketEvent('message_deleted', (data) => {
                this.app.chatManager.handleMessageDeleted(data);
            });

            window.electronAPI.onSocketEvent('typing_start', (data) => {
                this.app.chatManager.handleTypingStart(data);
            });

            window.electronAPI.onSocketEvent('typing_stop', (data) => {
                this.app.chatManager.handleTypingStop(data);
            });

            window.electronAPI.onSocketEvent('user_read_update', (data) => {
                this.app.chatManager.handleUserReadUpdate(data);
            });

            window.electronAPI.onSocketEvent('reminder_notification', (data) => {
                this.app.chatManager.handleReminderNotification(data);
            });

            // Reaction Events
            window.electronAPI.onSocketEvent('reaction_added', (data) => {
                this.app.chatManager.handleReactionAdded(data);
            });

            window.electronAPI.onSocketEvent('reaction_removed', (data) => {
                this.app.chatManager.handleReactionRemoved(data);
            });

            // 음성 채널 상태 업데이트 (서버 전체 브로드캐스트)
            window.electronAPI.onSocketEvent('voice_state_update', (data) => {
                console.log('[SocketManager] voice_state_update received:', data);
                this.app.serverManager.handleVoiceStateUpdate(data);
            });

            // 화면 공유 시작 - P2P 연결 생성
            window.electronAPI.onSocketEvent('screen_share_started', async (data) => {
                console.log('[SocketManager] screen_share_started received:', data);
                const channelId = this.app.serverManager.currentChannel?.id;
                if (channelId) {
                    this.app.serverManager.updateParticipantScreenShare(channelId, data.userId, true);
                }

                // P2P 연결 생성 시도
                if (this.app.webRTCManager && data.callerId && !this.app.webRTCManager.peers[data.callerId]) {
                    console.log('[SocketManager] Creating peer connection to screen sharer:', data.callerId);
                    await this.app.webRTCManager.createPeerConnection(data.callerId, false);
                }
            });

            // 새 사용자 참여 - P2P 연결 생성
            window.electronAPI.onSocketEvent('user_joined', async (data) => {
                console.log('[SocketManager] user_joined received:', data);
                const channelId = data.channelId;
                const participants = data.participants || [];

                if (channelId) {
                    this.app.serverManager.updateVoiceParticipants(channelId, participants);
                }

                // P2P 연결 생성 시도
                if (this.app.webRTCManager && data.callerId && this.app.webRTCManager.isCallActive && !this.app.webRTCManager.peers[data.callerId]) {
                    console.log('[SocketManager] Creating peer connection to new user:', data.callerId);
                    await this.app.webRTCManager.createPeerConnection(data.callerId, true);
                }
            });

            // WebRTC Events는 WebRTCManager.setupSignalingListeners에서 직접 처리함

        } catch (error) {
            console.error('소켓 연결 실패:', error);
        }
    }

    disconnect() {
        if (window.electronAPI && window.electronAPI.disconnectSocket) {
            window.electronAPI.disconnectSocket();
        }
    }

    emit(event, data) {
        if (window.electronAPI && window.electronAPI.emitSocketEvent) {
            window.electronAPI.emitSocketEvent(event, data);
        }
    }
}

/**
 * SocketConnection - Infrastructure Layer
 * SRP: Socket.IO 연결 관리만 담당
 * DIP: 추상화에 의존 (electronAPI)
 */
export class SocketConnection {
    constructor(apiBase, token) {
        this.apiBase = apiBase;
        this.token = token;
        this.isConnected = false;
    }

    /**
     * Socket 연결
     * @returns {Promise<boolean>} 연결 성공 여부
     */
    connect() {
        if (!window.electronAPI?.connectSocket) {
            console.error('[SocketConnection] electronAPI.connectSocket이 정의되지 않음');
            return false;
        }

        try {
            window.electronAPI.connectSocket(this.apiBase, this.token);
            return true;
        } catch (error) {
            console.error('[SocketConnection] 연결 실패:', error);
            return false;
        }
    }

    /**
     * Socket 연결 해제
     */
    disconnect() {
        if (window.electronAPI?.disconnectSocket) {
            window.electronAPI.disconnectSocket();
            this.isConnected = false;
        }
    }

    /**
     * 연결 상태 확인
     * @returns {boolean}
     */
    getConnectionState() {
        return this.isConnected;
    }

    /**
     * 연결 상태 업데이트
     * @param {boolean} connected
     */
    setConnectionState(connected) {
        this.isConnected = connected;
    }
}


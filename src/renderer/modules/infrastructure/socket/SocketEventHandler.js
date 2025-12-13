/**
 * SocketEventHandler - Infrastructure Layer
 * SRP: Socket 이벤트 리스너 등록/해제만 담당
 * OCP: 확장에는 열려있고 수정에는 닫혀있음 (이벤트 핸들러 추가 가능)
 */
export class SocketEventHandler {
    constructor() {
        this.handlers = new Map(); // event -> Set<handler>
    }

    /**
     * 이벤트 리스너 등록
     * @param {string} event - 이벤트 이름
     * @param {Function} handler - 이벤트 핸들러
     */
    on(event, handler) {
        if (!window.electronAPI?.onSocketEvent) {
            console.warn('[SocketEventHandler] onSocketEvent not available');
            return;
        }

        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }

        this.handlers.get(event).add(handler);
        window.electronAPI.onSocketEvent(event, handler);
    }

    /**
     * 이벤트 리스너 해제
     * @param {string} event - 이벤트 이름
     * @param {Function} handler - 이벤트 핸들러 (선택적)
     */
    off(event, handler = null) {
        if (handler) {
            const handlers = this.handlers.get(event);
            if (handlers) {
                handlers.delete(handler);
            }
        } else {
            this.handlers.delete(event);
        }
    }

    /**
     * 모든 리스너 해제
     */
    removeAllListeners() {
        this.handlers.clear();
    }

    /**
     * 등록된 이벤트 목록 반환
     * @returns {Array<string>}
     */
    getRegisteredEvents() {
        return Array.from(this.handlers.keys());
    }
}


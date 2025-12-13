/**
 * SocketEventDispatcher - Infrastructure Layer
 * SRP: Socket 이벤트 발행만 담당
 * DIP: 추상화에 의존 (electronAPI)
 */
export class SocketEventDispatcher {
    /**
     * 이벤트 발행
     * @param {string} event - 이벤트 이름
     * @param {any} data - 이벤트 데이터
     */
    emit(event, data) {
        if (window.electronAPI?.emitSocketEvent) {
            window.electronAPI.emitSocketEvent(event, data);
        } else {
            console.warn('[SocketEventDispatcher] emitSocketEvent not available');
        }
    }

    /**
     * 여러 이벤트 일괄 발행
     * @param {Array<{event: string, data: any}>} events
     */
    emitBatch(events) {
        events.forEach(({ event, data }) => this.emit(event, data));
    }
}


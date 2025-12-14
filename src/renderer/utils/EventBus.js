/**
 * EventBus - Pub/Sub (Observer) Pattern Implementation
 * 싱글톤 패턴으로 전역 이벤트 버스 제공
 * Manager 간 결합도를 낮추기 위한 이벤트 기반 통신
 */
class EventBus {
    constructor() {
        if (EventBus.instance) {
            return EventBus.instance;
        }
        
        this.events = {}; // eventName -> [listeners]
        EventBus.instance = this;
    }

    /**
     * 이벤트 구독
     * @param {string} eventName - 이벤트 이름
     * @param {Function} callback - 이벤트 발생 시 호출될 콜백 함수
     * @returns {Function} unsubscribe 함수
     */
    on(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        
        this.events[eventName].push(callback);
        
        // unsubscribe 함수 반환
        return () => {
            this.off(eventName, callback);
        };
    }

    /**
     * 이벤트 한 번만 구독 (once)
     * @param {string} eventName - 이벤트 이름
     * @param {Function} callback - 이벤트 발생 시 호출될 콜백 함수
     */
    once(eventName, callback) {
        const onceWrapper = (...args) => {
            callback(...args);
            this.off(eventName, onceWrapper);
        };
        this.on(eventName, onceWrapper);
    }

    /**
     * 이벤트 발생
     * @param {string} eventName - 이벤트 이름
     * @param {*} data - 이벤트 데이터
     */
    emit(eventName, data) {
        if (!this.events[eventName]) {
            return;
        }
        
        this.events[eventName].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in event handler for "${eventName}":`, error);
            }
        });
    }

    /**
     * 이벤트 구독 해제
     * @param {string} eventName - 이벤트 이름
     * @param {Function} callback - 구독 해제할 콜백 함수 (없으면 모든 리스너 제거)
     */
    off(eventName, callback) {
        if (!this.events[eventName]) {
            return;
        }
        
        if (callback) {
            this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
        } else {
            // callback이 없으면 모든 리스너 제거
            delete this.events[eventName];
        }
    }

    /**
     * 모든 이벤트 리스너 제거
     */
    clear() {
        this.events = {};
    }

    /**
     * 특정 이벤트의 리스너 개수 반환
     * @param {string} eventName - 이벤트 이름
     * @returns {number}
     */
    listenerCount(eventName) {
        return this.events[eventName]?.length || 0;
    }

    /**
     * 모든 이벤트 이름 목록 반환
     * @returns {string[]}
     */
    eventNames() {
        return Object.keys(this.events);
    }
}

// 싱글톤 인스턴스 생성
const eventBus = new EventBus();

export default eventBus;


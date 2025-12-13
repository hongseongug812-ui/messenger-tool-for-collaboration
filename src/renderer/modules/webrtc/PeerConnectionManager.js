/**
 * PeerConnectionManager - Single Responsibility: Peer Connection 관리
 * SRP: Peer Connection 생성, 관리, 종료만 담당
 */
export class PeerConnectionManager {
    constructor(iceServers) {
        this.peers = {}; // sid -> RTCPeerConnection
        this.iceServers = iceServers;
    }

    /**
     * Peer Connection 생성
     * @param {string} targetSid - 대상 Socket ID
     * @param {boolean} isInitiator - 초기화자인지 여부
     * @returns {RTCPeerConnection} 생성된 Peer Connection
     */
    create(targetSid, isInitiator) {
        if (this.peers[targetSid]) {
            console.log('[PeerConnection] Peer already exists:', targetSid);
            return this.peers[targetSid];
        }

        const pc = new RTCPeerConnection(this.iceServers);
        this.peers[targetSid] = pc;
        console.log('[PeerConnection] Created peer connection:', targetSid, 'initiator:', isInitiator);
        return pc;
    }

    /**
     * Peer Connection 가져오기
     * @param {string} targetSid - 대상 Socket ID
     * @returns {RTCPeerConnection|null}
     */
    get(targetSid) {
        return this.peers[targetSid] || null;
    }

    /**
     * Peer Connection 존재 여부 확인
     * @param {string} targetSid - 대상 Socket ID
     * @returns {boolean}
     */
    exists(targetSid) {
        return !!this.peers[targetSid];
    }

    /**
     * Peer Connection 종료 및 제거
     * @param {string} targetSid - 대상 Socket ID
     */
    close(targetSid) {
        const pc = this.peers[targetSid];
        if (pc) {
            pc.close();
            delete this.peers[targetSid];
            console.log('[PeerConnection] Closed peer connection:', targetSid);
        }
    }

    /**
     * 모든 Peer Connection 종료
     */
    closeAll() {
        Object.keys(this.peers).forEach(sid => this.close(sid));
    }

    /**
     * 모든 Peer Connection 목록 반환
     * @returns {Object} sid -> RTCPeerConnection 맵
     */
    getAll() {
        return { ...this.peers };
    }
}


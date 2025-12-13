/**
 * MediaStreamManager - Single Responsibility: 미디어 스트림 관리
 * SRP: 로컬/원격 스트림 관리만 담당
 */
export class MediaStreamManager {
    constructor() {
        this.localStream = null;
        this.screenStream = null;
        this.remoteStreams = {}; // sid -> MediaStream
    }

    /**
     * 로컬 스트림 설정
     * @param {MediaStream} stream - 미디어 스트림
     */
    setLocalStream(stream) {
        this.localStream = stream;
        console.log('[MediaStream] Local stream set:', stream?.id);
    }

    /**
     * 화면 공유 스트림 설정
     * @param {MediaStream} stream - 화면 공유 스트림
     */
    setScreenStream(stream) {
        this.screenStream = stream;
        console.log('[MediaStream] Screen stream set:', stream?.id);
    }

    /**
     * 원격 스트림 저장
     * @param {string} sid - Socket ID
     * @param {MediaStream} stream - 미디어 스트림
     */
    setRemoteStream(sid, stream) {
        this.remoteStreams[sid] = stream;
        console.log('[MediaStream] Remote stream set for:', sid);
    }

    /**
     * 로컬 스트림 가져오기
     * @returns {MediaStream|null}
     */
    getLocalStream() {
        return this.localStream;
    }

    /**
     * 화면 공유 스트림 가져오기
     * @returns {MediaStream|null}
     */
    getScreenStream() {
        return this.screenStream;
    }

    /**
     * 원격 스트림 가져오기
     * @param {string} sid - Socket ID
     * @returns {MediaStream|null}
     */
    getRemoteStream(sid) {
        return this.remoteStreams[sid] || null;
    }

    /**
     * 모든 원격 스트림 가져오기
     * @returns {Object} sid -> MediaStream 맵
     */
    getAllRemoteStreams() {
        return { ...this.remoteStreams };
    }

    /**
     * 스트림의 트랙 중지 및 정리
     * @param {MediaStream} stream - 정리할 스트림
     */
    stopStream(stream) {
        if (stream) {
            stream.getTracks().forEach(track => {
                track.stop();
                console.log('[MediaStream] Track stopped:', track.kind, track.id);
            });
        }
    }

    /**
     * 로컬 스트림 정리
     */
    stopLocalStream() {
        this.stopStream(this.localStream);
        this.localStream = null;
    }

    /**
     * 화면 공유 스트림 정리
     */
    stopScreenStream() {
        this.stopStream(this.screenStream);
        this.screenStream = null;
    }

    /**
     * 원격 스트림 제거
     * @param {string} sid - Socket ID
     */
    removeRemoteStream(sid) {
        const stream = this.remoteStreams[sid];
        if (stream) {
            this.stopStream(stream);
            delete this.remoteStreams[sid];
            console.log('[MediaStream] Remote stream removed:', sid);
        }
    }

    /**
     * 모든 원격 스트림 정리
     */
    clearRemoteStreams() {
        Object.keys(this.remoteStreams).forEach(sid => {
            this.removeRemoteStream(sid);
        });
    }

    /**
     * 모든 스트림 정리
     */
    clearAll() {
        this.stopLocalStream();
        this.stopScreenStream();
        this.clearRemoteStreams();
    }
}


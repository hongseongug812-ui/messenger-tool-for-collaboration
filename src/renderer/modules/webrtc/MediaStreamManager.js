/**
 * MediaStreamManager - Single Responsibility: 미디어 스트림 관리
 * SRP: 로컬/원격 스트림 관리만 담당
 */
export class MediaStreamManager {
    constructor() {
        this.localStream = null;
        this.screenStream = null;
        this.remoteStreams = {}; // sid -> MediaStream (카메라 스트림)
        this.remoteScreenStreams = {}; // sid -> MediaStream (화면 공유 스트림)
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
     * @param {boolean} isScreenShare - 화면 공유 스트림인지 여부
     */
    setRemoteStream(sid, stream, isScreenShare = false) {
        if (isScreenShare) {
            this.remoteScreenStreams[sid] = stream;
            console.log('[MediaStream] Remote screen stream set for:', sid);
        } else {
            this.remoteStreams[sid] = stream;
            console.log('[MediaStream] Remote stream set for:', sid);
        }
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
     * @param {boolean} isScreenShare - 화면 공유 스트림인지 여부
     * @returns {MediaStream|null}
     */
    getRemoteStream(sid, isScreenShare = false) {
        if (isScreenShare) {
            return this.remoteScreenStreams[sid] || null;
        }
        return this.remoteStreams[sid] || null;
    }
    
    /**
     * 원격 화면 공유 스트림 가져오기
     * @param {string} sid - Socket ID
     * @returns {MediaStream|null}
     */
    getRemoteScreenStream(sid) {
        return this.remoteScreenStreams[sid] || null;
    }

    /**
     * 모든 원격 스트림 가져오기
     * @returns {Object} sid -> MediaStream 맵
     */
    getAllRemoteStreams() {
        return { ...this.remoteStreams };
    }

    /**
     * 모든 원격 화면 공유 스트림 가져오기
     * @returns {Object} sid -> MediaStream 맵
     */
    getAllRemoteScreenStreams() {
        return { ...this.remoteScreenStreams };
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
     * @param {boolean} isScreenShare - 화면 공유 스트림인지 여부
     */
    removeRemoteStream(sid, isScreenShare = false) {
        if (isScreenShare) {
            const stream = this.remoteScreenStreams[sid];
            if (stream) {
                this.stopStream(stream);
                delete this.remoteScreenStreams[sid];
                console.log('[MediaStream] Remote screen stream removed:', sid);
            }
        } else {
            const stream = this.remoteStreams[sid];
            if (stream) {
                this.stopStream(stream);
                delete this.remoteStreams[sid];
                console.log('[MediaStream] Remote stream removed:', sid);
            }
        }
    }

    /**
     * 모든 원격 스트림 정리
     */
    clearRemoteStreams() {
        Object.keys(this.remoteStreams).forEach(sid => {
            this.removeRemoteStream(sid, false);
        });
        Object.keys(this.remoteScreenStreams).forEach(sid => {
            this.removeRemoteStream(sid, true);
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


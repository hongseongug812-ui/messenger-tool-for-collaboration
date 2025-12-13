/**
 * SignalingHandler - Single Responsibility: WebRTC 시그널링 처리
 * SRP: Offer/Answer/ICE Candidate 처리만 담당
 * DIP: 의존성을 인터페이스로 주입받음
 */
export class SignalingHandler {
    constructor(peerConnectionManager, mediaStreamManager, socketManager, serverManager, webRTCManager = null) {
        this.peerConnectionManager = peerConnectionManager;
        this.mediaStreamManager = mediaStreamManager;
        this.socketManager = socketManager;
        this.serverManager = serverManager;
        this.webRTCManager = webRTCManager; // WebRTCManager 참조 (ontrack 이벤트 처리용)
    }

    /**
     * Offer 처리
     * @param {string} fromSid - 송신자 Socket ID
     * @param {Object} offer - SDP Offer
     */
    async handleOffer(fromSid, offer) {
        console.log('[Signaling] handleOffer from:', fromSid, 'offer:', offer);

        if (!offer) {
            console.error('[Signaling] Invalid offer: null or undefined');
            return;
        }

        try {
            // 기존 peer connection이 있는지 확인
            let pc = this.peerConnectionManager.get(fromSid);
            
            // 기존 연결이 있고 stable 상태가 아니면 재생성 또는 대기
            if (pc && pc.signalingState !== 'stable') {
                console.warn('[Signaling] ⚠️ Existing peer connection in wrong state:', pc.signalingState);
                // have-local-offer 상태면 우리가 offer를 보낸 상태이므로 answer를 기다려야 함
                if (pc.signalingState === 'have-local-offer') {
                    console.log('[Signaling] ℹ️ Already sent offer, waiting for answer. Ignoring incoming offer.');
                    return;
                }
                // 다른 상태면 연결을 재생성
                console.log('[Signaling] Recreating peer connection due to wrong state');
                this.peerConnectionManager.close(fromSid);
                pc = null;
            }
            
            // peer connection이 없으면 생성
            if (!pc) {
                pc = this.peerConnectionManager.create(fromSid, false);
                
                // 로컬 스트림 추가 (화면 공유 포함)
                const localStream = this.mediaStreamManager.getLocalStream();
                if (localStream) {
                    localStream.getTracks().forEach(track => {
                        pc.addTrack(track, localStream);
                    });
                    console.log('[Signaling] ✅ Added local stream tracks to new peer connection');
                }
                
                // 화면 공유 스트림도 추가
                const screenStream = this.mediaStreamManager.getScreenStream();
                if (screenStream && screenStream !== localStream) {
                    screenStream.getVideoTracks().forEach(track => {
                        pc.addTrack(track, screenStream);
                    });
                    console.log('[Signaling] ✅ Added screen share tracks to new peer connection');
                }
                
                // 🔥 핵심: ontrack 이벤트 핸들러 설정 (스트림 수신 처리)
                pc.ontrack = (event) => {
                    console.log('[Signaling] 🎬 ontrack event received from:', fromSid);
                    if (event.streams && event.streams.length > 0) {
                        const stream = event.streams[0];
                        console.log('[Signaling] ✅ Stream received, processing...');
                        if (this.webRTCManager && this.webRTCManager.handleRemoteStream) {
                            this.webRTCManager.handleRemoteStream(fromSid, stream);
                        } else {
                            // Fallback: 직접 저장
                            this.mediaStreamManager.setRemoteStream(fromSid, stream);
                            console.log('[Signaling] ⚠️ WebRTCManager not available, stream saved directly');
                        }
                    } else if (event.track) {
                        const stream = new MediaStream([event.track]);
                        if (this.webRTCManager && this.webRTCManager.handleRemoteStream) {
                            this.webRTCManager.handleRemoteStream(fromSid, stream);
                        } else {
                            this.mediaStreamManager.setRemoteStream(fromSid, stream);
                        }
                    }
                };
                
                // ICE candidate 이벤트도 설정
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex
                        };
                        this.socketManager.emit('webrtc_ice_candidate', {
                            targetSid: fromSid,
                            candidate: candidateData
                        });
                    }
                };
            }

            // offer 형식 보정
            let offerDesc = offer;
            if (typeof offer === 'object' && !offer.type) {
                offerDesc = { type: 'offer', sdp: offer.sdp || offer };
            }

            // signalingState 확인 - stable 상태여야 offer를 받을 수 있음
            if (pc.signalingState !== 'stable') {
                console.warn('[Signaling] ⚠️ Wrong state for setting offer:', pc.signalingState, '- Will attempt anyway');
            }

            await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
            console.log('[Signaling] ✅ Offer set, new state:', pc.signalingState);

            // answer 생성 전 상태 확인
            if (pc.signalingState !== 'have-remote-offer') {
                console.warn('[Signaling] ⚠️ Wrong state for creating answer:', pc.signalingState);
            }

            const answer = await pc.createAnswer();
            console.log('[Signaling] Answer created, SDP contains video:', answer.sdp.includes('m=video'));
            await pc.setLocalDescription(answer);
            console.log('[Signaling] ✅ Answer created and set, new state:', pc.signalingState);

            const channelId = this.serverManager.currentChannel?.id;
            this.socketManager.emit('webrtc_answer', {
                targetSid: fromSid,
                answer: answer,
                channelId: channelId
            });
            console.log('[Signaling] ✅ Answer sent to:', fromSid);
        } catch (error) {
            console.error('[Signaling] ❌ Error handling offer:', error);
        }
    }

    /**
     * Answer 처리
     * @param {string} fromSid - 송신자 Socket ID
     * @param {Object} answer - SDP Answer
     */
    async handleAnswer(fromSid, answer) {
        console.log('[Signaling] handleAnswer from:', fromSid);

        if (!answer) {
            console.error('[Signaling] Invalid answer: null or undefined');
            return;
        }

        const pc = this.peerConnectionManager.get(fromSid);
        if (!pc) {
            console.warn('[Signaling] No peer connection found for:', fromSid);
            return;
        }

        try {
            const currentState = pc.signalingState;
            console.log('[Signaling] Current signaling state:', currentState, '- Setting answer from:', fromSid);

            // answer는 have-local-offer 상태일 때만 설정 가능
            if (currentState === 'stable') {
                console.log('[Signaling] ✅ Already in stable state, answer already processed');
                return;
            }

            if (currentState === 'have-remote-offer') {
                console.log('[Signaling] ℹ️ In have-remote-offer state - we should create answer, not receive it');
                return;
            }

            if (currentState !== 'have-local-offer') {
                console.warn('[Signaling] ⚠️ Wrong signaling state for setting answer:', currentState, '- Expected: have-local-offer');
                return;
            }

            // answer 형식 보정
            let answerDesc = answer;
            if (typeof answer === 'object' && !answer.type) {
                answerDesc = { type: 'answer', sdp: answer.sdp || answer };
            }

            await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
            console.log('[Signaling] ✅ Answer set successfully, new state:', pc.signalingState);
        } catch (error) {
            if (error.name === 'InvalidStateError') {
                console.warn('[Signaling] ⚠️ InvalidStateError - Answer already set or wrong state:', pc.signalingState);
            } else {
                console.error('[Signaling] ❌ Error setting answer:', error);
            }
        }
    }

    /**
     * ICE Candidate 처리
     * @param {string} fromSid - 송신자 Socket ID
     * @param {Object} candidate - ICE Candidate
     */
    async handleIceCandidate(fromSid, candidate) {
        const pc = this.peerConnectionManager.get(fromSid);
        if (!pc) {
            console.warn('[Signaling] No peer connection for ICE candidate:', fromSid);
            return;
        }

        // candidate가 유효한지 확인
        if (!candidate || (!candidate.candidate && !candidate.sdpMid)) {
            console.warn('[Signaling] Invalid ICE candidate, skipping');
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[Signaling] ✅ ICE candidate added');
        } catch (error) {
            console.error('[Signaling] ❌ Error adding ICE candidate:', error);
        }
    }
}


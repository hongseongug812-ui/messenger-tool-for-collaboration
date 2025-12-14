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
        console.log('='.repeat(60));
        console.log('[Signaling] 🔔 handleOffer CALLED');
        console.log('[Signaling] 📨 Offer received from sid:', fromSid);
        console.log('[Signaling] 📨 Offer type:', offer?.type);
        console.log('[Signaling] 📨 Offer has SDP:', !!offer?.sdp);
        console.log('='.repeat(60));

        if (!offer) {
            console.error('[Signaling] ❌ Invalid offer: null or undefined');
            return;
        }

        try {
            // 기존 peer connection이 있는지 확인
            let pc = this.peerConnectionManager.get(fromSid);

            if (pc && pc.signalingState === 'have-local-offer') {
                return; // 이미 offer 보냄, answer 대기 중
            }
            if (pc && pc.signalingState !== 'stable') {
                this.peerConnectionManager.close(fromSid);
                pc = null;
            }

            // peer connection이 없으면 생성
            if (!pc) {
                pc = this.peerConnectionManager.create(fromSid, false);

                // 🔥 Transceiver 추가: 영상 수신 준비 명시
                try {
                    pc.addTransceiver('video', { direction: 'recvonly' });
                    pc.addTransceiver('audio', { direction: 'recvonly' });
                    console.log('[Signaling] ✅ Added transceivers (recvonly) for video and audio');
                } catch (err) {
                    console.warn('[Signaling] ⚠️ Error adding transceivers (may already exist):', err);
                }

                // 🔥 Connection 상태 모니터링
                pc.oniceconnectionstatechange = () => {
                    console.log('[Signaling] 🧊 ICE State:', pc.iceConnectionState, 'for peer:', fromSid);
                    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                        console.error('[Signaling] ❌ ICE connection failed or disconnected for:', fromSid);
                    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                        console.log('[Signaling] ✅ ICE connection established for:', fromSid);
                    }
                };

                pc.onconnectionstatechange = () => {
                    console.log('[Signaling] 🔗 Connection State:', pc.connectionState, 'for peer:', fromSid);
                    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                        console.error('[Signaling] ❌ Connection failed or disconnected for:', fromSid);
                    } else if (pc.connectionState === 'connected') {
                        console.log('[Signaling] ✅ Connection established for:', fromSid);
                    }
                };

                // 로컬 스트림 추가 (카메라 + 마이크)
                const localStream = this.mediaStreamManager.getLocalStream();
                if (localStream) {
                    localStream.getTracks().forEach(track => {
                        pc.addTrack(track, localStream);
                    });
                    console.log('[Signaling] ✅ Added local stream (camera + mic) to new peer connection');
                }

                // 화면 공유 스트림도 별도 트랙으로 추가
                const screenStream = this.mediaStreamManager.getScreenStream();
                if (screenStream && screenStream !== localStream) {
                    screenStream.getVideoTracks().forEach(track => {
                        pc.addTrack(track, screenStream);
                    });
                    console.log('[Signaling] ✅ Added screen share track as separate track to new peer connection');
                }

                // 🔥 핵심: ontrack 이벤트 핸들러 설정 (스트림 수신 처리)
                pc.ontrack = (event) => {
                    console.log('========================================');
                    console.log('[Signaling] 📥 TRACK EVENT FIRED!');
                    console.log('[Signaling] 🎬 ontrack event received from:', fromSid);
                    console.log('[Signaling] 📥 Track received from', fromSid, ':', {
                        streams: event.streams?.length || 0,
                        trackKind: event.track?.kind,
                        trackId: event.track?.id,
                        trackLabel: event.track?.label,
                        trackEnabled: event.track?.enabled,
                        trackReadyState: event.track?.readyState
                    });

                    let stream = null;

                    if (event.streams && event.streams.length > 0) {
                        stream = event.streams[0];
                        console.log('[Signaling] 📥 Stream received from', fromSid, ':', stream);
                        console.log('[Signaling] ✅ Stream found in event.streams[0]:', {
                            streamId: stream.id,
                            active: stream.active,
                            tracks: stream.getTracks().map(t => `${t.kind}:${t.id}(${t.label})`)
                        });
                    } else if (event.track) {
                        // streams가 없지만 track이 있는 경우 (일부 브라우저/Electron)
                        console.log('[Signaling] ⚠️ No streams but track exists, creating new MediaStream');
                        stream = new MediaStream([event.track]);
                        console.log('[Signaling] ✅ Created MediaStream from track:', {
                            streamId: stream.id,
                            trackKind: event.track.kind,
                            trackId: event.track.id,
                            trackLabel: event.track.label
                        });
                    } else {
                        console.error('[Signaling] ❌ No streams and no track in ontrack event');
                        return;
                    }

                    // 🔥 스트림을 반드시 저장
                    if (this.webRTCManager && this.webRTCManager.handleRemoteStream) {
                        console.log('[Signaling] 📤 Calling handleRemoteStream with sid:', fromSid);
                        this.webRTCManager.handleRemoteStream(fromSid, stream);

                        // 저장 확인 (즉시 확인)
                        setTimeout(() => {
                            const savedStream = this.mediaStreamManager.getRemoteStream(fromSid);
                            const savedScreenStream = this.mediaStreamManager.getRemoteScreenStream(fromSid);
                            const allStreams = this.mediaStreamManager.getAllRemoteStreams();
                            const allScreenStreams = this.mediaStreamManager.getAllRemoteScreenStreams();
                            console.log('[Signaling] ✅ Stream storage verification:', {
                                savedCameraStream: !!savedStream,
                                savedScreenStream: !!savedScreenStream,
                                fromSid: fromSid,
                                allCameraStreams: Object.keys(allStreams),
                                allScreenStreams: Object.keys(allScreenStreams)
                            });
                        }, 100);
                    } else {
                        // Fallback: 직접 저장
                        console.warn('[Signaling] ⚠️ WebRTCManager not available, saving directly');
                        this.mediaStreamManager.setRemoteStream(fromSid, stream);
                        console.log('[Signaling] ✅ Stream saved directly to MediaStreamManager');
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

                        // 🔥 빈 candidate 필터링
                        if (!candidateData.candidate || candidateData.candidate.trim() === '') {
                            console.log('[Signaling] ⚠️ Empty candidate, skipping');
                            return;
                        }

                        console.log('[Signaling] 📤 Sending ICE candidate to:', fromSid, {
                            candidate: candidateData.candidate?.substring(0, 50) + '...',
                            sdpMid: candidateData.sdpMid,
                            sdpMLineIndex: candidateData.sdpMLineIndex
                        });

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
            console.log('[Signaling] 🔧 PC signalingState before createAnswer:', pc.signalingState);
            if (pc.signalingState !== 'have-remote-offer') {
                console.warn('[Signaling] ⚠️ Wrong state for creating answer:', pc.signalingState);
            }

            console.log('[Signaling] 🔧 Calling createAnswer()...');
            const answer = await pc.createAnswer();
            console.log('[Signaling] ✅ createAnswer() SUCCEEDED!');
            console.log('[Signaling] 📋 Answer type:', answer.type);
            console.log('[Signaling] 📋 Answer SDP contains video:', answer.sdp.includes('m=video'));
            console.log('[Signaling] 📋 Answer SDP contains audio:', answer.sdp.includes('m=audio'));

            await pc.setLocalDescription(answer);
            console.log('[Signaling] ✅ setLocalDescription(answer) SUCCEEDED, new state:', pc.signalingState);

            const channelId = this.serverManager.currentChannel?.id;

            // 🔥 CRITICAL: targetSid는 offer를 보낸 peer의 sid (서버가 이 peer에게 라우팅)
            // 서버에서 fromSid를 현재 Peer B의 sid로 변환해서 보냄
            const answerData = {
                targetSid: fromSid,  // 서버에서 이 sid로 라우팅함
                answer: answer,
                channelId: channelId
            };

            console.log('='.repeat(60));
            console.log('[Signaling] 📤 EMITTING webrtc_answer TO SERVER!');
            console.log('[Signaling] 📤 targetSid (destination):', fromSid);
            console.log('[Signaling] 📤 answer type:', answer?.type);
            console.log('[Signaling] 📤 channelId:', channelId);
            console.log('='.repeat(60));

            this.socketManager.emit('webrtc_answer', answerData);
            console.log('[Signaling] ✅ webrtc_answer EMITTED TO SERVER!');
        } catch (error) {
            console.error('[Signaling] ❌ Error handling offer:', error);
            console.error('[Signaling] ❌ Error stack:', error.stack);
        }
    }

    /**
     * Answer 처리
     * @param {string} fromSid - 송신자 Socket ID
     * @param {Object} answer - SDP Answer
     */
    async handleAnswer(fromSid, answer) {
        console.log('[Signaling] 📩 Answer received from', fromSid);

        if (!answer) {
            console.error('[Signaling] ❌ Invalid answer: null or undefined');
            return;
        }

        const pc = this.peerConnectionManager.get(fromSid);
        if (!pc) {
            console.error('[Signaling] ❌ No peer connection found for:', fromSid, '- Cannot set answer');
            return;
        }

        try {
            const currentState = pc.signalingState;
            console.log('[Signaling] 📋 Current signaling state:', currentState, '- Setting answer from:', fromSid);
            console.log('[Signaling] 📋 Peer connection exists:', !!pc, 'connectionState:', pc.connectionState, 'iceConnectionState:', pc.iceConnectionState);

            // answer는 have-local-offer 상태일 때만 설정 가능
            if (currentState === 'stable') {
                console.log('[Signaling] ✅ Already in stable state, answer already processed');
                return;
            }

            if (currentState === 'have-remote-offer') {
                console.log('[Signaling] ℹ️ In have-remote-offer state - we should create answer, not receive it');
                return;
            }

            // 🔥 have-local-offer 상태가 아니면 경고하지만 시도는 함
            if (currentState !== 'have-local-offer') {
                console.warn('[Signaling] ⚠️ Wrong signaling state for setting answer:', currentState, '- Expected: have-local-offer');
                console.warn('[Signaling] ⚠️ Attempting to set answer anyway - this might cause an error');
                // 상태가 맞지 않아도 시도 (일부 경우 정상 작동할 수 있음)
            }

            // answer 형식 보정
            let answerDesc = answer;
            if (typeof answer === 'object' && !answer.type) {
                answerDesc = { type: 'answer', sdp: answer.sdp || answer };
            }

            console.log('[Signaling] 📤 Attempting to set remote description (answer)...');
            await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
            console.log('[Signaling] ✅ Answer set successfully! New state:', pc.signalingState);
            console.log('[Signaling] ✅ Connection state after answer:', pc.connectionState, 'ICE state:', pc.iceConnectionState);
        } catch (error) {
            if (error.name === 'InvalidStateError') {
                console.error('[Signaling] ❌ InvalidStateError - Answer setting failed:', {
                    error: error.message,
                    currentState: pc.signalingState,
                    hasLocalDescription: !!pc.localDescription,
                    hasRemoteDescription: !!pc.remoteDescription
                });
            } else {
                console.error('[Signaling] ❌ Error setting answer:', {
                    error: error.name,
                    message: error.message,
                    currentState: pc.signalingState,
                    connectionState: pc.connectionState
                });
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


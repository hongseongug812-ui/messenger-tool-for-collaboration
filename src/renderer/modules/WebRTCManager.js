/**
 * WebRTCManager - Facade Pattern
 * SOLID 원칙 적용:
 * - SRP: 각 책임을 별도 클래스로 분리
 * - DIP: 의존성 주입을 통해 결합도 감소
 * - OCP: 확장에는 열려있고 수정에는 닫혀있음
 */
import { PeerConnectionManager } from './webrtc/PeerConnectionManager.js';
import { MediaStreamManager } from './webrtc/MediaStreamManager.js';
import { SignalingHandler } from './webrtc/SignalingHandler.js';
import { ScreenShareManager } from './webrtc/ScreenShareManager.js';
import { WebRTCUIController } from './webrtc/WebRTCUIController.js';

export class WebRTCManager {
    constructor(app) {
        this.app = app;
        this.isCallActive = false;
        this.isMinimized = false;
        this.isDeafened = false; // 헤드셋 음소거 상태

        // Audio Context for Visualizer
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;

        // SOLID: 의존성 주입 (Dependency Inversion Principle)
        const iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        // 각 책임별 매니저 초기화 (Single Responsibility Principle)
        this.peerConnectionManager = new PeerConnectionManager(iceServers);
        this.mediaStreamManager = new MediaStreamManager();
        this.signalingHandler = new SignalingHandler(
            this.peerConnectionManager,
            this.mediaStreamManager,
            app.socketManager,
            app.serverManager,
            this // WebRTCManager 참조 전달 (ontrack 이벤트 처리용)
        );
        this.screenShareManager = new ScreenShareManager(
            this.mediaStreamManager,
            this.peerConnectionManager,
            app.socketManager,
            app.serverManager,
            app
        );
        this.uiController = new WebRTCUIController(app);

        this.bindEvents();
    }

    // 하위 호환성을 위한 getter/setter
    get peers() {
        return this.peerConnectionManager.getAll();
    }

    // peers는 읽기 전용이므로 setter 없음 (직접 수정 불가, peerConnectionManager를 통해 관리)

    get localStream() {
        return this.mediaStreamManager.getLocalStream();
    }

    set localStream(stream) {
        this.mediaStreamManager.setLocalStream(stream);
    }

    get screenStream() {
        return this.mediaStreamManager.getScreenStream();
    }

    set screenStream(stream) {
        this.mediaStreamManager.setScreenStream(stream);
    }

    get remoteStreams() {
        return this.mediaStreamManager.getAllRemoteStreams();
    }

    bindEvents() {
        // Bind Start Call Button
        const btnVoice = document.getElementById('btn-voice-chat');
        if (btnVoice) {
            btnVoice.addEventListener('click', () => this.startCall());
        }

        // Screen share option buttons (from modal)
        document.getElementById('share-entire-screen')?.addEventListener('click', () => {
            this.hideScreenShareModal();
            this.startScreenShare();
        });

        document.getElementById('share-window')?.addEventListener('click', () => {
            this.hideScreenShareModal();
            this.startScreenShare();
        });

        document.getElementById('share-tab')?.addEventListener('click', () => {
            this.hideScreenShareModal();
            this.startScreenShare();
        });

        // Stop share button
        document.getElementById('btn-stop-share')?.addEventListener('click', () => {
            this.stopScreenShare();
        });

        // 통화 컨트롤 바의 화면 공유 중지 버튼
        document.getElementById('btn-stop-screen-share')?.addEventListener('click', () => {
            this.stopScreenShare();
        });

        // 디스코드 스타일 통화 컨트롤 바 버튼들
        document.getElementById('btn-toggle-mic')?.addEventListener('click', () => {
            this.toggleMicrophone();
        });

        document.getElementById('btn-toggle-headset')?.addEventListener('click', () => {
            this.toggleHeadset();
        });

        document.getElementById('btn-screen-share-call')?.addEventListener('click', () => {
            this.startScreenShare();
        });

        document.getElementById('btn-end-call')?.addEventListener('click', () => {
            this.leaveCall();
        });

        // 헤더의 화면 공유 버튼
        document.getElementById('btn-screen-share')?.addEventListener('click', () => {
            this.startScreenShare();
        });

        // WebRTC 시그널링 이벤트 리스너
        this.setupSignalingListeners();
    }

    // WebRTC 시그널링 이벤트 설정
    setupSignalingListeners() {
        if (!window.electronAPI) {
            console.log('[WebRTC] electronAPI not available, retrying in 1s...');
            setTimeout(() => this.setupSignalingListeners(), 1000);
            return;
        }

        // 통화 참가자 목록 받기
        window.electronAPI.onSocketEvent('call_participants', (data) => {
            console.log('[WebRTC] Received call_participants:', data);
            const existingPeers = data.existingPeers || [];
            const participants = data.participants || [];
            const channelId = data.channelId;

            // 참가자 목록 UI 업데이트
            if (channelId) {
                this.app.serverManager.updateVoiceParticipants(channelId, participants);
            }

            // 기존 참가자들에게 offer 보내기
            existingPeers.forEach(async (peerSid) => {
                await this.createPeerConnection(peerSid, true);
            });
        });

        // 새 사용자 참여
        window.electronAPI.onSocketEvent('user_joined', async (data) => {
            console.log('[WebRTC] User joined:', data);
            const channelId = data.channelId;
            const participants = data.participants || [];

            // 참가자 목록 UI 업데이트
            if (channelId) {
                this.app.serverManager.updateVoiceParticipants(channelId, participants);
            }

            // 새 참가자와 P2P 연결 생성 (음성 채널에 있으면)
            if (data.callerId && this.isCallActive) {
                console.log('[WebRTC] Creating peer connection to new user:', data.callerId);
                await this.createPeerConnection(data.callerId, true);
            }
        });

        // 사용자 퇴장
        window.electronAPI.onSocketEvent('user_left', (data) => {
            console.log('[WebRTC] User left:', data);
            this.closePeerConnection(data.callerId);

            // 참가자 목록 업데이트
            const channelId = this.app.serverManager.currentChannel?.id;
            if (channelId) {
                this.app.serverManager.updateVoiceParticipants(channelId, data.participants || []);
            }
        });

        // WebRTC offer 받기
        window.electronAPI.onSocketEvent('webrtc_offer', async (data) => {
            console.log('[WebRTC] Received offer from:', data.fromSid);
            await this.handleOffer(data.fromSid, data.offer);
        });

        // 레거시 offer 이벤트 (호환성)
        window.electronAPI.onSocketEvent('offer', async (data) => {
            console.log('[WebRTC] Received legacy offer from:', data.callerId);
            await this.handleOffer(data.callerId, data.sdp);
        });

        // WebRTC answer 받기
        window.electronAPI.onSocketEvent('webrtc_answer', async (data) => {
            console.log('[WebRTC] Received answer from:', data.fromSid);
            await this.handleAnswer(data.fromSid, data.answer);
        });

        // 레거시 answer 이벤트 (호환성)
        window.electronAPI.onSocketEvent('answer', async (data) => {
            console.log('[WebRTC] Received legacy answer from:', data.callerId);
            await this.handleAnswer(data.callerId, data.sdp);
        });

        // ICE candidate 받기
        window.electronAPI.onSocketEvent('webrtc_ice_candidate', async (data) => {
            await this.handleIceCandidate(data.fromSid, data.candidate);
        });

        // 레거시 ICE candidate 이벤트 (호환성)
        window.electronAPI.onSocketEvent('ice_candidate', async (data) => {
            await this.handleIceCandidate(data.callerId, data.candidate);
        });

        // 화면 공유 시작 알림
        window.electronAPI.onSocketEvent('screen_share_started', async (data) => {
            console.log('[WebRTC] Screen share started by:', data.callerId, 'userId:', data.userId);
            const channelId = this.app.serverManager.currentChannel?.id;
            if (channelId) {
                this.app.serverManager.updateParticipantScreenShare(channelId, data.userId, true);
                
                // userId와 sid 매핑 저장 (findUserIdBySid에서 사용)
                if (data.callerId && data.userId) {
                    const participants = this.app.serverManager.voiceParticipants?.[channelId] || [];
                    let participant = participants.find(p => p.id === data.userId);
                    if (participant) {
                        participant.sid = data.callerId;
                        console.log('[WebRTC] ✅ Mapped userId to sid:', data.userId, '->', data.callerId);
                    } else {
                        // 참가자 목록에 없으면 추가
                        participants.push({
                            id: data.userId,
                            sid: data.callerId,
                            name: 'User' // 나중에 업데이트될 수 있음
                        });
                        console.log('[WebRTC] ✅ Added participant mapping:', data.userId, '->', data.callerId);
                    }
                }
            }

            // 화면 공유자와 P2P 연결이 없으면 생성
            // 통화 중이 아니어도 화면 공유를 보기 위해 연결 생성
            // SOLID: PeerConnectionManager를 통해 확인
            if (data.callerId && !this.peerConnectionManager.exists(data.callerId)) {
                console.log('[WebRTC] Creating peer connection to screen sharer:', data.callerId);
                // 통화 중이 아니면 통화 참가
                if (!this.isCallActive) {
                    // 오디오 스트림 가져오기 (통화 시작)
                    try {
                        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        this.isCallActive = true;
                        this.showCallControlBar();
                        
                        // 통화 참가
                        const currentUser = this.app.auth?.currentUser;
                        const serverId = this.app.serverManager.currentServer?.id;
                        this.app.socketManager.emit('call_join', {
                            currentChannelId: channelId,
                            serverId: serverId,
                            userId: currentUser?.id,
                            userName: currentUser?.name || 'User'
                        });
                    } catch (err) {
                        console.error('[WebRTC] Failed to start call for screen share:', err);
                    }
                }
                // P2P 연결 생성 (initiator: true - offer 생성)
                await this.createPeerConnection(data.callerId, true);
            } else if (data.callerId && this.peerConnectionManager.exists(data.callerId)) {
                // 이미 연결이 있으면 renegotiation 트리거
                console.log('[WebRTC] Peer connection exists, triggering renegotiation');
                const pc = this.peerConnectionManager.get(data.callerId);
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    this.app.socketManager.emit('webrtc_offer', {
                        targetSid: data.callerId,
                        offer: offer,
                        channelId: channelId
                    });
                } catch (err) {
                    console.error('[WebRTC] Renegotiation error:', err);
                }
            }

            // 화면 공유 시작 알림 수신 시 즉시 원격 화면 공유 표시 시도 (Discord 스타일)
            const userId = data.userId;
            const callerSid = data.callerId;
            if (userId || callerSid) {
                console.log('[WebRTC] 🎬 Screen share started, immediately checking for stream');
                
                // 즉시 한 번 체크
                const checkStream = () => {
                    let stream = null;
                    
                    // sid로 직접 스트림 찾기
                    if (callerSid) {
                        stream = this.mediaStreamManager.getRemoteStream(callerSid);
                        if (stream && stream.getVideoTracks().length > 0) {
                            console.log('[WebRTC] ✅ Found stream by sid:', callerSid);
                            this.showRemoteScreenShare(userId, stream);
                            return true;
                        }
                    }
                    
                    // userId로 sid 찾아서 스트림 찾기
                    if (!stream && userId) {
                        const sid = this.findSidByUserId(userId);
                        if (sid) {
                            stream = this.mediaStreamManager.getRemoteStream(sid);
                            if (stream && stream.getVideoTracks().length > 0) {
                                console.log('[WebRTC] ✅ Found stream by userId:', userId);
                                this.showRemoteScreenShare(userId, stream);
                                return true;
                            }
                        }
                    }
                    
                    // 모든 원격 스트림에서 비디오 트랙 찾기
                    const allStreams = this.mediaStreamManager.getAllRemoteStreams();
                    for (const [sid, s] of Object.entries(allStreams)) {
                        if (s && s.getVideoTracks && s.getVideoTracks().length > 0) {
                            console.log('[WebRTC] ✅ Found video stream in all streams:', sid);
                            this.showRemoteScreenShare(userId, s);
                            return true;
                        }
                    }
                    
                    return false;
                };

                // 즉시 체크
                if (!checkStream()) {
                    // 없으면 빠르게 재시도 (Discord처럼)
                    let attempts = 0;
                    const maxAttempts = 10; // 5초 동안 빠르게 시도
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (checkStream() || attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            if (attempts >= maxAttempts) {
                                console.log('[WebRTC] ⚠️ Stream not found after', maxAttempts, 'attempts');
                            }
                        }
                    }, 500); // 0.5초마다 체크 (더 빠르게)
                }
            }
        });

        // 화면 공유 종료 알림
        window.electronAPI.onSocketEvent('screen_share_stopped', (data) => {
            console.log('[WebRTC] Screen share stopped by:', data.callerId);
            const channelId = this.app.serverManager.currentChannel?.id;
            if (channelId) {
                this.app.serverManager.updateParticipantScreenShare(channelId, data.userId, false);
            }
        });

        console.log('[WebRTC] Signaling listeners setup complete');
    }

    // P2P 연결 생성
    async createPeerConnection(targetSid, isInitiator) {
        console.log('[WebRTC] Creating peer connection to:', targetSid, 'initiator:', isInitiator);

        // SOLID: PeerConnectionManager를 통해 관리
        if (this.peerConnectionManager.exists(targetSid)) {
            console.log('[WebRTC] Peer already exists:', targetSid);
            return this.peerConnectionManager.get(targetSid);
        }

        const pc = this.peerConnectionManager.create(targetSid, isInitiator);

        // 로컬 스트림 추가 (항상 추가)
        const localStream = this.mediaStreamManager.getLocalStream();
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
            console.log('[WebRTC] ✅ Added local stream tracks to peer:', targetSid);
        }

        // 화면 공유 중이면 화면 스트림도 추가 (나중에 입장하는 사용자에게도 전송)
        const screenStream = this.mediaStreamManager.getScreenStream();
        if (screenStream && screenStream !== localStream) {
            screenStream.getVideoTracks().forEach(track => {
                pc.addTrack(track, screenStream);
            });
            console.log('[WebRTC] ✅ Added screen share track to new peer:', targetSid);
        }

        // ICE candidate 이벤트
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                // RTCIceCandidate 객체를 JSON으로 직렬화
                const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                };
                this.app.socketManager.emit('webrtc_ice_candidate', {
                    targetSid: targetSid,
                    candidate: candidateData
                });
            }
        };

        // 원격 스트림 수신
        pc.ontrack = (event) => {
            console.log('[WebRTC] 🎬 ontrack event received from:', targetSid);
            console.log('[WebRTC] Event details:', {
                streams: event.streams?.length || 0,
                track: event.track ? {
                    kind: event.track.kind,
                    id: event.track.id,
                    enabled: event.track.enabled,
                    readyState: event.track.readyState,
                    label: event.track.label
                } : null,
                transceiver: event.transceiver ? {
                    direction: event.transceiver.direction,
                    currentDirection: event.transceiver.currentDirection
                } : null
            });
            
            if (event.streams && event.streams.length > 0) {
                const stream = event.streams[0];
                const tracks = stream.getTracks();
                console.log('[WebRTC] ✅ Stream found in ontrack:', stream.id);
                console.log('[WebRTC] Stream tracks:', tracks.map(t => `${t.kind}:${t.id}:${t.label || 'no-label'}:${t.readyState}`));
                
                // 비디오 트랙이 있는지 확인
                const videoTracks = stream.getVideoTracks();
                if (videoTracks.length > 0) {
                    console.log('[WebRTC] 🎥 Video track detected! Track details:', {
                        id: videoTracks[0].id,
                        label: videoTracks[0].label,
                        enabled: videoTracks[0].enabled,
                        readyState: videoTracks[0].readyState,
                        muted: videoTracks[0].muted
                    });
                }
                
                this.handleRemoteStream(targetSid, stream);
            } else if (event.track) {
                // streams가 없지만 track이 있는 경우 (일부 브라우저)
                console.log('[WebRTC] ⚠️ No streams but track exists, creating stream');
                console.log('[WebRTC] Track kind:', event.track.kind, 'id:', event.track.id);
                const stream = new MediaStream([event.track]);
                this.handleRemoteStream(targetSid, stream);
            } else {
                console.warn('[WebRTC] ❌ No streams or track in ontrack event');
            }
        };

        // 연결 상태 변경
        pc.onconnectionstatechange = () => {
            console.log('[WebRTC] Connection state:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.closePeerConnection(targetSid);
            }
        };

        // 트랙 추가 시 재협상 (renegotiation)
        pc.onnegotiationneeded = async () => {
            console.log('[WebRTC] Negotiation needed for:', targetSid);
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                const channelId = this.app.serverManager.currentChannel?.id;
                this.app.socketManager.emit('webrtc_offer', {
                    targetSid: targetSid,
                    offer: offer,
                    channelId: channelId
                });
                console.log('[WebRTC] Sent renegotiation offer to:', targetSid);
            } catch (err) {
                console.error('[WebRTC] Renegotiation error:', err);
            }
        };

        // initiator면 offer 생성
        if (isInitiator) {
            try {
                // 이미 offer가 생성되었는지 확인
                if (pc.signalingState !== 'stable' && pc.localDescription) {
                    console.log('[WebRTC] ⚠️ Offer already created, skipping duplicate');
                    return pc;
                }
                
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log('[WebRTC] ✅ Offer created and set, state:', pc.signalingState);

                const channelId = this.app.serverManager.currentChannel?.id;
                this.app.socketManager.emit('webrtc_offer', {
                    targetSid: targetSid,
                    offer: offer,
                    channelId: channelId
                });
            } catch (error) {
                console.error('[WebRTC] ❌ Error creating offer:', error);
            }
        }

        return pc;
    }

    // Offer 처리
    async handleOffer(fromSid, offer) {
        console.log('[WebRTC] handleOffer from:', fromSid, 'offer:', offer);

        if (!offer) {
            console.error('[WebRTC] Invalid offer: null or undefined');
            return;
        }

        try {
            // 기존 peer connection이 있는지 확인
            let pc = this.peerConnectionManager.get(fromSid);
            
            // 기존 연결이 있고 stable 상태가 아니면 처리
            if (pc && pc.signalingState !== 'stable') {
                console.warn('[WebRTC] ⚠️ Existing peer connection in wrong state:', pc.signalingState);
                // have-local-offer 상태면 우리가 offer를 보낸 상태이므로 answer를 기다려야 함
                if (pc.signalingState === 'have-local-offer') {
                    console.log('[WebRTC] ℹ️ Already sent offer, waiting for answer. Ignoring incoming offer.');
                    return;
                }
                // 다른 상태면 연결을 재생성
                console.log('[WebRTC] Recreating peer connection due to wrong state');
                this.peerConnectionManager.close(fromSid);
                pc = null;
            }
            
            // peer connection이 없으면 생성
            if (!pc) {
                pc = await this.createPeerConnection(fromSid, false);
            }

            // offer 형식 보정 (type 속성이 없으면 추가)
            let offerDesc = offer;
            if (typeof offer === 'object' && !offer.type) {
                offerDesc = { type: 'offer', sdp: offer.sdp || offer };
            }

            // signalingState 확인 - stable 상태여야 offer를 받을 수 있음
            if (pc.signalingState !== 'stable') {
                console.warn('[WebRTC] ⚠️ Wrong state for setting offer:', pc.signalingState, '- Will attempt anyway');
            }
            
            await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
            console.log('[WebRTC] ✅ Offer set, new state:', pc.signalingState);
            
            // answer 생성 전 상태 확인
            if (pc.signalingState !== 'have-remote-offer') {
                console.warn('[WebRTC] ⚠️ Wrong state for creating answer:', pc.signalingState);
            }
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[WebRTC] ✅ Answer created and set, new state:', pc.signalingState);

            const channelId = this.app.serverManager.currentChannel?.id;
            this.app.socketManager.emit('webrtc_answer', {
                targetSid: fromSid,
                answer: answer,
                channelId: channelId
            });
            console.log('[WebRTC] ✅ Answer sent to:', fromSid);
        } catch (error) {
            console.error('[WebRTC] ❌ Error handling offer:', error);
        }
    }

    // Answer 처리
    async handleAnswer(fromSid, answer) {
        console.log('[WebRTC] handleAnswer from:', fromSid);

        if (!answer) {
            console.error('[WebRTC] Invalid answer: null or undefined');
            return;
        }

        // SOLID: PeerConnectionManager를 통해 가져오기
        const pc = this.peerConnectionManager.get(fromSid);
        if (!pc) {
            console.warn('[WebRTC] No peer connection found for:', fromSid);
            return;
        }

        try {
            // signalingState 확인
            const currentState = pc.signalingState;
            console.log('[WebRTC] Current signaling state:', currentState, '- Setting answer from:', fromSid);
            
            // answer는 have-local-offer 상태일 때만 설정 가능
            // (우리가 offer를 보냈고, 상대방이 answer를 보낸 경우)
            if (currentState === 'stable') {
                // 이미 stable 상태면 answer가 이미 설정된 것
                console.log('[WebRTC] ✅ Already in stable state, answer already processed');
                return;
            }
            
            // answer는 have-local-offer 상태일 때만 설정 가능
            // (우리가 offer를 보냈고, 상대방이 answer를 보낸 경우)
            if (currentState === 'have-remote-offer') {
                // have-remote-offer 상태면 우리가 answer를 생성해야 하는 상황
                // 이 경우는 handleOffer에서 처리되므로 여기서는 스킵
                console.log('[WebRTC] ℹ️ In have-remote-offer state - we should create answer, not receive it');
                return;
            }
            
            if (currentState !== 'have-local-offer') {
                console.warn('[WebRTC] ⚠️ Wrong signaling state for setting answer:', currentState, '- Expected: have-local-offer');
                console.warn('[WebRTC] This answer might be for a different negotiation or already processed');
                return;
            }

            // answer 형식 보정 (type 속성이 없으면 추가)
            let answerDesc = answer;
            if (typeof answer === 'object' && !answer.type) {
                answerDesc = { type: 'answer', sdp: answer.sdp || answer };
            }

            await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
            console.log('[WebRTC] ✅ Answer set successfully, new state:', pc.signalingState);
        } catch (error) {
            // InvalidStateError는 이미 처리된 경우이므로 경고만
            if (error.name === 'InvalidStateError') {
                console.warn('[WebRTC] ⚠️ InvalidStateError - Answer already set or wrong state:', pc.signalingState);
            } else {
                console.error('[WebRTC] ❌ Error setting answer:', error);
            }
        }
    }

    // ICE candidate 처리
    async handleIceCandidate(fromSid, candidate) {
        // SOLID: PeerConnectionManager를 통해 가져오기
        const pc = this.peerConnectionManager.get(fromSid);
        // candidate가 유효한지 확인 (빈 객체나 sdpMid가 없으면 스킵)
        if (pc && candidate && (candidate.candidate || candidate.sdpMid)) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error('[WebRTC] Error adding ICE candidate:', err);
            }
        }
    }

    // 원격 스트림 처리
    handleRemoteStream(fromSid, stream) {
        if (!stream) {
            console.warn('[WebRTC] handleRemoteStream called with null stream');
            return;
        }

        console.log('[WebRTC] Handling remote stream from:', fromSid);
        console.log('[WebRTC] Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, label: t.label })));

        // 원격 스트림 저장 (나중에 화면 공유 보기에 사용)
        // SOLID: MediaStreamManager를 통해 관리
        this.mediaStreamManager.setRemoteStream(fromSid, stream);

        // 오디오 트랙 처리
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            let audioEl = document.getElementById(`remote-audio-${fromSid}`);
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = `remote-audio-${fromSid}`;
                audioEl.autoplay = true;
                audioEl.playsInline = true;
                document.body.appendChild(audioEl);
            }
            audioEl.srcObject = stream;
            audioEl.play().catch(e => console.error('[WebRTC] Audio play error:', e));
        }

        // 비디오 트랙이 있으면 즉시 화면 공유로 표시 (Discord 스타일)
        const videoTracks = stream.getVideoTracks();
        console.log('[WebRTC] Video tracks count:', videoTracks.length);
        if (videoTracks.length > 0) {
            console.log('[WebRTC] 🎥 Video track detected! Immediately showing remote screen share from:', fromSid);
            console.log('[WebRTC] Video track details:', {
                id: videoTracks[0].id,
                label: videoTracks[0].label,
                enabled: videoTracks[0].enabled,
                readyState: videoTracks[0].readyState,
                muted: videoTracks[0].muted
            });
            
            // 사용자 ID 찾기 (fromSid로)
            const userId = this.findUserIdBySid(fromSid);
            console.log('[WebRTC] Found userId:', userId, 'for sid:', fromSid);
            
            // Discord처럼 즉시 표시 (중복 체크 최소화)
            const existingContainer = document.getElementById('remote-screen-share-container');
            const existingVideo = document.getElementById('remote-screen-video');
            
            // 같은 스트림이면 스킵 (하지만 트랙이 바뀌었을 수 있으므로 확인)
            if (existingContainer && existingVideo && existingVideo.srcObject === stream) {
                const currentTracks = existingVideo.srcObject?.getVideoTracks() || [];
                const newTracks = stream.getVideoTracks();
                if (currentTracks.length > 0 && newTracks.length > 0 && currentTracks[0].id === newTracks[0].id) {
                    console.log('[WebRTC] ⚠️ Same stream already showing, skipping');
                    return;
                }
            }
            
            // 즉시 UI 업데이트 (Discord처럼)
            console.log('[WebRTC] 🚀 Immediately displaying screen share');
            this.uiController.showRemoteScreenShare(userId || fromSid, stream);
        } else {
            console.log('[WebRTC] ⚠️ No video tracks in stream, audio only');
        }
    }

    // SID로 사용자 ID 찾기 (참가자 목록에서)
    findUserIdBySid(sid) {
        if (!sid) return null;
        
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) {
            console.log('[WebRTC] No current channel for findUserIdBySid');
            return null;
        }
        
        // 참가자 목록에서 찾기
        const participants = this.app.serverManager.voiceParticipants?.[channelId] || [];
        console.log('[WebRTC] Searching for sid:', sid, 'in', participants.length, 'participants');
        console.log('[WebRTC] Participants:', participants.map(p => ({ id: p.id, name: p.name, sid: p.sid })));
        
        // sid로 직접 찾기
        let participant = participants.find(p => p.sid === sid);
        if (participant) {
            console.log('[WebRTC] ✅ Found participant by sid:', participant.id);
            return participant.id;
        }
        
        // 캐시에서도 찾기
        const cachedParticipants = this.app.serverManager.voiceParticipantsCache?.[channelId] || [];
        participant = cachedParticipants.find(p => p.sid === sid);
        if (participant) {
            console.log('[WebRTC] ✅ Found participant in cache by sid:', participant.id);
            return participant.id;
        }
        
        console.log('[WebRTC] ⚠️ Participant not found for sid:', sid);
        return null;
    }

    // 원격 화면 공유 표시
    showRemoteScreenShare(userId, stream) {
        console.log('[WebRTC] 🖥️ showRemoteScreenShare called - userId:', userId, 'stream provided:', !!stream);

        // stream이 없으면 저장된 스트림에서 찾기
        let videoStream = stream;
        if (!videoStream) {
            console.log('[WebRTC] Stream not provided, searching in remoteStreams...');
            const remoteStreams = this.mediaStreamManager.getAllRemoteStreams();
            console.log('[WebRTC] Available remote streams (sids):', Object.keys(remoteStreams));
            
            // remoteStreams에서 비디오 트랙이 있는 스트림 찾기
            for (const [sid, s] of Object.entries(remoteStreams)) {
                if (!s) {
                    console.log('[WebRTC] ⚠️ Null stream for sid:', sid);
                    continue;
                }
                
                if (!s.getVideoTracks) {
                    console.log('[WebRTC] ⚠️ Stream has no getVideoTracks method for sid:', sid);
                    continue;
                }
                
                const videoTracks = s.getVideoTracks();
                console.log('[WebRTC] Checking sid:', sid, 'video tracks:', videoTracks.length);
                
                if (videoTracks.length > 0) {
                    console.log('[WebRTC] ✅ Found video stream from sid:', sid, 'tracks:', videoTracks.map(t => t.id));
                    videoStream = s;
                    break;
                }
            }
            
            // 여전히 없으면 userId로 sid 찾기 시도
            if (!videoStream && userId) {
                console.log('[WebRTC] Trying to find stream by userId:', userId);
                const channelId = this.app.serverManager.currentChannel?.id;
                const participants = this.app.serverManager.voiceParticipants?.[channelId] || [];
                console.log('[WebRTC] Participants:', participants.map(p => ({ id: p.id, sid: p.sid })));
                
                const participant = participants.find(p => p.id === userId);
                if (participant && participant.sid) {
                    console.log('[WebRTC] Found participant sid:', participant.sid);
                    videoStream = this.mediaStreamManager.getRemoteStream(participant.sid);
                    if (videoStream) {
                        const tracks = videoStream.getVideoTracks();
                        console.log('[WebRTC] ✅ Found video stream by userId:', userId, 'tracks:', tracks.length);
                    } else {
                        console.log('[WebRTC] ⚠️ No stream found for participant sid:', participant.sid);
                    }
                } else {
                    console.log('[WebRTC] ⚠️ Participant not found for userId:', userId);
                }
            }
        }

        if (!videoStream) {
            console.error('[WebRTC] ❌ No video stream found');
            const allStreams = this.mediaStreamManager.getAllRemoteStreams();
            console.log('[WebRTC] Available remote streams:', Object.keys(allStreams));
            console.log('[WebRTC] Stream details:', Object.entries(allStreams).map(([sid, s]) => ({
                sid,
                hasStream: !!s,
                hasGetVideoTracks: s && typeof s.getVideoTracks === 'function',
                videoTracks: s && s.getVideoTracks ? s.getVideoTracks().length : 0
            })));
            
            // 🔥 마지막 시도: 모든 peer connection에서 active receiver 확인
            const peers = this.peerConnectionManager.getAll();
            console.log('[WebRTC] 🔍 Checking all peer connections for video receivers...');
            for (const [sid, pc] of Object.entries(peers)) {
                try {
                    const receivers = pc.getReceivers();
                    const videoReceivers = receivers.filter(r => r.track && r.track.kind === 'video' && r.track.readyState === 'live');
                    if (videoReceivers.length > 0) {
                        console.log('[WebRTC] ✅ Found live video receiver in peer:', sid);
                        const videoTrack = videoReceivers[0].track;
                        const stream = new MediaStream([videoTrack]);
                        console.log('[WebRTC] 🚀 Creating stream from receiver track');
                        this.mediaStreamManager.setRemoteStream(sid, stream);
                        this.showRemoteScreenShare(userId, stream);
                        return;
                    }
                } catch (err) {
                    console.error('[WebRTC] Error checking receivers for', sid, ':', err);
                }
            }
            
            return;
        }

        const videoTracks = videoStream.getVideoTracks();
        if (!videoTracks || videoTracks.length === 0) {
            console.error('[WebRTC] ❌ No video tracks in stream');
            return;
        }

        console.log('[WebRTC] ✅ Video stream found with', videoTracks.length, 'track(s)');

        // SOLID: UI 업데이트는 UIController에 위임
        this.uiController.showRemoteScreenShare(userId, videoStream);
    }

    // userId로 sid 찾기
    findSidByUserId(userId) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return null;
        
        const participants = this.app.serverManager.voiceParticipants?.[channelId] || [];
        const participant = participants.find(p => p.id === userId);
        if (participant && participant.sid) {
            return participant.sid;
        }
        
        // 캐시에서도 찾기
        const cachedParticipants = this.app.serverManager.voiceParticipantsCache?.[channelId] || [];
        const cachedParticipant = cachedParticipants.find(p => p.id === userId);
        if (cachedParticipant && cachedParticipant.sid) {
            return cachedParticipant.sid;
        }
        
        return null;
    }

    // 사용자 ID로 이름 찾기
    findUserNameByUserId(userId) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return null;
        
        const participants = this.app.serverManager.voiceParticipants?.[channelId] || [];
        const participant = participants.find(p => p.id === userId);
        return participant?.name || null;
    }

    // P2P 연결 종료는 위의 closePeerConnection 메서드 사용
    // 원격 오디오 요소 제거는 removeRemoteVideo에서 처리됨

    // 화면 공유 트랙을 모든 P2P 연결에 추가
    addScreenShareToPeers() {
        if (!this.screenStream) {
            console.log('[WebRTC] No screen stream to add');
            return;
        }

        const videoTrack = this.screenStream.getVideoTracks()[0];
        if (!videoTrack) {
            console.log('[WebRTC] No video track in screen stream');
            return;
        }

        console.log('[WebRTC] Adding screen share track to', Object.keys(this.peers).length, 'peers');

        Object.entries(this.peers).forEach(async ([sid, pc]) => {
            try {
                // 기존 비디오 트랙 sender가 있으면 교체, 없으면 추가
                const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(videoTrack);
                    console.log('[WebRTC] Replaced video track for peer:', sid);
                } else {
                    pc.addTrack(videoTrack, this.screenStream);
                    console.log('[WebRTC] Added video track for peer:', sid);
                }
                
                // 트랙 추가 후 renegotiation 필요
                // onnegotiationneeded 이벤트가 자동으로 트리거되지만, 
                // 명시적으로 offer 생성하여 빠른 업데이트 보장
                if (pc.signalingState === 'stable') {
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        const channelId = this.app.serverManager.currentChannel?.id;
                        this.app.socketManager.emit('webrtc_offer', {
                            targetSid: sid,
                            offer: offer,
                            channelId: channelId
                        });
                        console.log('[WebRTC] Sent renegotiation offer for screen share to:', sid);
                    } catch (err) {
                        console.error('[WebRTC] Error creating offer for screen share:', err);
                    }
                }
            } catch (err) {
                console.error('[WebRTC] Error adding screen share to peer:', sid, err);
            }
        });
    }

    // SOLID: 화면 공유 종료는 ScreenShareManager에 위임
    stopScreenShare() {
        this.screenShareManager.stop();
        this.uiController.hideScreenSharePreview();
    }

    stopScreenShareLegacy() {
        console.log('[WebRTC] stopScreenShare called');

        // 화면 공유만 종료하고 통화는 유지
        this.uiController.hideScreenSharePreview();

        // 화면 공유 스트림이 있으면 트랙 중지
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // 참가자 목록에서 화면 공유 표시 제거
        const channelId = this.app.serverManager.currentChannel?.id;
        const userId = this.app.auth?.currentUser?.id;
        if (channelId && userId) {
            this.app.serverManager.updateParticipantScreenShare(channelId, userId, false);
        }

        // 컨트롤 바 상태 업데이트
        this.updateScreenShareStatus(false);

        // 화면 공유 버튼 상태
        const shareBtn = document.getElementById('btn-screen-share-call');
        const stopBtn = document.getElementById('btn-stop-screen-share');
        if (shareBtn) shareBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';

        // 다른 참가자들에게 화면 공유 종료 알림
        this.app.socketManager?.emit('screen_share_stopped', { channelId });
    }

    hideScreenShareModal() {
        const modal = document.getElementById('screen-share-modal');
        if (modal) modal.style.display = 'none';
    }

    async startCall() {
        if (this.isCallActive) return;
        this.updateConnectionState("Connecting...");
        await this.initiateMedia(false);
    }

    // SOLID: 화면 공유는 ScreenShareManager에 위임
    async startScreenShare() {
        console.log('[WebRTC] startScreenShare called, isCallActive:', this.isCallActive);
        
        // 통화 중이 아니면 화면 공유 불가 (또는 통화 시작)
        if (!this.isCallActive) {
            console.log('[WebRTC] Not in call, starting call first...');
            // 통화 시작
            await this.startCall();
        }
        
        try {
            return await this.screenShareManager.start();
        } catch (error) {
            console.error('[WebRTC] Error starting screen share:', error);
            // 에러 발생 시 레거시 메서드로 폴백
            return this.startScreenShareLegacy();
        }
    }

    async startScreenShareLegacy() {
        console.log('[WebRTC] startScreenShare called');

        // 통화 중이 아니면 화면 공유 불가
        if (!this.isCallActive) {
            console.log('[WebRTC] Not in call, cannot share screen');
            alert('화면 공유를 하려면 먼저 음성 통화에 참여해야 합니다.');
            return;
        }

        this.updateConnectionState("Starting Screen Share...");

        // Get available screen sources from Electron
        if (window.electronAPI && window.electronAPI.getScreenSources) {
            try {
                console.log('[WebRTC] Getting screen sources via electronAPI...');
                const sources = await window.electronAPI.getScreenSources();
                console.log('[WebRTC] Got sources:', sources?.length);

                if (sources && sources.length > 0) {
                    this.showSourcePicker(sources);
                    return;
                }
            } catch (err) {
                console.log('[WebRTC] Error getting sources:', err);
            }
        } else {
            console.log('[WebRTC] electronAPI.getScreenSources not available');
        }

        // Fallback to browser API
        console.log('[WebRTC] Using fallback getDisplayMedia');
        await this.addScreenShareToCall();
    }

    // 통화 중에 화면 공유 추가
    async addScreenShareToCall() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            // 화면 공유 트랙을 기존 연결에 추가
            const videoTrack = this.screenStream.getVideoTracks()[0];
            if (!videoTrack) {
                throw new Error('화면 공유 트랙을 가져올 수 없습니다');
            }

            // 채팅 영역에 화면 공유 표시
            this.showScreenSharePreview(this.screenStream);

            // 참가자 목록에 화면 공유 표시
            const channelId = this.app.serverManager.currentChannel?.id;
            const userId = this.app.auth?.currentUser?.id;
            console.log('[WebRTC] Screen share started, channelId:', channelId, 'userId:', userId);
            if (channelId && userId) {
                this.app.serverManager.updateParticipantScreenShare(channelId, userId, true);
            }

            // 컨트롤 바에 화면 공유 상태 표시
            this.updateScreenShareStatus(true);

            // 화면 공유 버튼 숨기고 중지 버튼 표시
            const shareBtn = document.getElementById('btn-screen-share-call');
            const stopBtn = document.getElementById('btn-stop-screen-share');
            if (shareBtn) shareBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';

            // 다른 참가자들에게 화면 공유 시작 알림
            const serverId = this.app.serverManager.currentServer?.id;
            this.app.socketManager?.emit('screen_share_started', { channelId, serverId });

            // 화면 공유 트랙을 기존 P2P 연결에 추가
            // 기존 연결이 없으면 나중에 참가자가 연결할 때 추가됨
            this.addScreenShareToPeers();

            // 화면 공유 종료 시 처리
            videoTrack.onended = () => {
                console.log('[WebRTC] Screen share track ended by user');
                this.hideScreenSharePreview();
                this.screenStream = null;
                // 참가자 목록에서 화면 공유 표시 제거
                if (channelId && userId) {
                    this.app.serverManager.updateParticipantScreenShare(channelId, userId, false);
                }
                // 컨트롤 바 상태 업데이트
                this.updateScreenShareStatus(false);
                if (shareBtn) {
                    shareBtn.style.display = '';
                    shareBtn.classList.remove('active');
                }
                if (stopBtn) stopBtn.style.display = 'none';

                // 다른 참가자들에게 화면 공유 종료 알림
                this.app.socketManager?.emit('screen_share_stopped', { channelId });
            };

        } catch (err) {
            console.error('[WebRTC] Screen share error:', err);
            this.updateConnectionState("Screen share failed");
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert('화면 공유 권한이 거부되었습니다.');
            } else {
                alert('화면 공유를 시작할 수 없습니다: ' + err.message);
            }
        }
    }

    // 화면 공유 상태 표시 업데이트
    updateScreenShareStatus(isSharing) {
        const statusEl = document.getElementById('screen-share-status');
        if (statusEl) {
            statusEl.style.display = isSharing ? 'inline' : 'none';
        }
    }

    showSourcePicker(sources) {
        // Create source picker modal
        const existingPicker = document.getElementById('source-picker-modal');
        if (existingPicker) existingPicker.remove();

        const modal = document.createElement('div');
        modal.id = 'source-picker-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';

        let sourcesHtml = sources.map(source => `
            <div class="source-item" data-id="${source.id}">
                <img src="${source.thumbnail}" alt="${source.name}" />
                <span>${source.name.substring(0, 30)}</span>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="modal" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>공유할 화면 선택</h3>
                    <button class="icon-btn modal-close" id="close-source-picker">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-height: 400px; overflow-y: auto;">
                    ${sourcesHtml}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Style source items
        const style = document.createElement('style');
        style.textContent = `
            .source-item {
                cursor: pointer;
                border: 2px solid transparent;
                border-radius: 8px;
                padding: 8px;
                text-align: center;
                transition: all 0.2s;
            }
            .source-item:hover {
                border-color: var(--primary);
                background: var(--bg-tertiary);
            }
            .source-item img {
                width: 100%;
                border-radius: 4px;
                margin-bottom: 5px;
            }
            .source-item span {
                font-size: 12px;
                color: var(--text-secondary);
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);

        // Event listeners
        document.getElementById('close-source-picker').onclick = () => modal.remove();

        modal.querySelectorAll('.source-item').forEach(item => {
            item.onclick = async () => {
                const sourceId = item.dataset.id;
                modal.remove();
                await this.startScreenShareWithSource(sourceId);
            };
        });
    }

    async startScreenShareWithSource(sourceId) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return;

        try {
            console.log('[WebRTC] Starting screen share with source:', sourceId);

            // Electron 환경: getUserMedia에 desktopCapturer 소스 ID 전달
            // 브라우저 환경: getDisplayMedia 사용
            let screenStream;
            
            if (window.electronAPI && sourceId) {
                // Electron 환경 - desktopCapturer로 선택한 소스 사용
                console.log('[WebRTC] Using Electron desktopCapturer with sourceId:', sourceId);
                try {
                    // Electron의 getUserMedia에 desktopCapturer constraints 전달
                    // Electron에서는 특별한 constraints 형식이 필요합니다
                    const constraints = {
                        audio: false,
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sourceId
                            }
                        }
                    };
                    
                    screenStream = await navigator.mediaDevices.getUserMedia(constraints);
                    console.log('[WebRTC] Successfully got stream via Electron getUserMedia');
                } catch (electronErr) {
                    console.warn('[WebRTC] Electron getUserMedia failed:', electronErr);
                    console.log('[WebRTC] Error details:', {
                        name: electronErr?.name,
                        message: electronErr?.message
                    });
                    
                    // Fallback: getDisplayMedia 시도 (최신 Electron에서 지원)
                    console.log('[WebRTC] Trying getDisplayMedia as fallback...');
                    try {
                        screenStream = await navigator.mediaDevices.getDisplayMedia({
                            video: { cursor: 'always' },
                            audio: false
                        });
                        console.log('[WebRTC] Successfully got stream via getDisplayMedia');
                    } catch (displayErr) {
                        console.error('[WebRTC] All methods failed:', displayErr);
                        const errorMsg = electronErr?.message || displayErr?.message || '알 수 없는 오류';
                        throw new Error(`화면 공유를 시작할 수 없습니다: ${errorMsg}`);
                    }
                }
            } else {
                // 브라우저 환경 또는 sourceId가 없는 경우
                console.log('[WebRTC] Using getDisplayMedia (browser or no sourceId)');
                try {
                    screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { cursor: 'always' },
                        audio: false
                    });
                } catch (err) {
                    console.error('[WebRTC] getDisplayMedia failed:', err);
                    throw err;
                }
            }

            if (!screenStream || screenStream.getVideoTracks().length === 0) {
                throw new Error('화면 공유 스트림을 가져올 수 없습니다');
            }

            this.screenStream = screenStream;

            // 통화 중이 아니면 통화 시작
            if (!this.isCallActive) {
                // 오디오 스트림도 가져오기 (통화 시작)
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    // 오디오 트랙을 화면 스트림에 추가
                    audioStream.getAudioTracks().forEach(track => {
                        this.screenStream.addTrack(track);
                    });
                } catch (err) {
                    console.warn('[WebRTC] Could not get audio stream:', err);
                }
                this.localStream = this.screenStream;
                this.isCallActive = true;
                this.showCallControlBar();
            } else {
                // 통화 중이면 화면 스트림만 별도로 저장
                // 기존 오디오 스트림은 유지
            }

            // 화면 공유 모달에 미리보기 표시
            this.showScreenSharePreview(this.screenStream);

            // 참가자 목록에 화면 공유 표시
            const userId = this.app.auth?.currentUser?.id;
            console.log('[WebRTC] Screen share - channelId:', channelId, 'userId:', userId);
            if (channelId && userId) {
                this.app.serverManager.updateParticipantScreenShare(channelId, userId, true);
            }

            // 컨트롤 바에 화면 공유 상태 표시
            this.updateScreenShareStatus(true);

            // 화면 공유 버튼 숨기고 중지 버튼 표시
            const shareBtn = document.getElementById('btn-screen-share-call');
            const stopBtn = document.getElementById('btn-stop-screen-share');
            if (shareBtn) shareBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';

            // 서버에 화면 공유 시작 알림
            const serverId = this.app.serverManager.currentServer?.id;
            this.app.socketManager.emit('screen_share_started', { channelId, serverId });

            // 통화 중이 아니면 통화 참가
            if (!this.localStream || !this.localStream.getAudioTracks().length) {
                // 통화 참가
                const currentUser = this.app.auth?.currentUser;
                this.app.socketManager.emit('call_join', {
                    currentChannelId: channelId,
                    serverId: serverId,
                    userId: currentUser?.id,
                    userName: currentUser?.name || 'User'
                });
            }

            // 화면 공유 트랙을 기존 P2P 연결에 추가
            // 기존 연결이 없으면 나중에 참가자가 연결할 때 추가됨
            this.addScreenShareToPeers();

            this.updateConnectionState("Screen Sharing");

            // 화면 공유 종료 처리
            const videoTrack = this.screenStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = () => {
                    console.log('[WebRTC] Screen share track ended');
                    // 화면 공유 종료 시 상태 업데이트
                    if (channelId && userId) {
                        this.app.serverManager.updateParticipantScreenShare(channelId, userId, false);
                    }
                    this.updateScreenShareStatus(false);
                    // 버튼 상태 복원
                    if (shareBtn) shareBtn.style.display = '';
                    if (stopBtn) stopBtn.style.display = 'none';
                    // 서버에 화면 공유 종료 알림
                    this.app.socketManager?.emit('screen_share_stopped', { channelId });
                    this.stopScreenShare();
                };
            }
        } catch (err) {
            console.error('[WebRTC] Error starting screen share:', err);
            this.updateConnectionState("Failed to share screen");
            alert('화면 공유를 시작할 수 없습니다: ' + err.message);
        }
    }

    async initiateMedia(isScreen) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) {
            console.error('[WebRTC] No channel selected');
            return;
        }

        try {
            console.log('[WebRTC] initiateMedia called, isScreen:', isScreen);

            if (isScreen) {
                // Screen Sharing (fallback)
                this.localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                // 화면 공유 모달에 미리보기 표시
                this.showScreenSharePreview();
            } else {
                // 음성 채널: 오디오만 사용 (비디오 없음)
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
            }

            this.isCallActive = true;

            if (!isScreen) {
                // 디스코드 스타일: 플로팅 오버레이 대신 컨트롤 바만 표시
                this.showCallControlBar();
            }

            this.setupAudioVisualizer(this.localStream);

            // 참가자 목록은 서버에서 voice_state_update 이벤트로 관리
            // 로컬 추가는 중복을 유발하므로 제거
            const currentUser = this.app.auth?.currentUser;
            console.log('[WebRTC] currentUser:', currentUser);

            // Join call room
            const serverId = this.app.serverManager.currentServer?.id;
            console.log('[WebRTC] Emitting call_join - channelId:', channelId, 'serverId:', serverId, 'userId:', currentUser?.id, 'userName:', currentUser?.name);
            this.app.socketManager.emit('call_join', {
                currentChannelId: channelId,
                serverId: serverId,
                userId: currentUser?.id,
                userName: currentUser?.name || 'User'
            });
            this.updateConnectionState(isScreen ? "Screen Sharing" : "Connected");

            // Handle stream stop (e.g. user clicks "Stop Sharing")
            if (this.localStream.getVideoTracks().length > 0) {
                this.localStream.getVideoTracks()[0].onended = () => {
                    this.leaveCall();
                    this.hideScreenSharePreview();
                };
            }

        } catch (err) {
            console.error('[WebRTC] Error accessing media:', err);
            this.updateConnectionState("Failed to access media");
        }
    }

    showScreenSharePreview(stream = null) {
        // 화면 공유 모달 닫기
        const modal = document.getElementById('screen-share-modal');
        if (modal) modal.style.display = 'none';

        // 기존 컨테이너가 있으면 제거
        let container = document.getElementById('screen-share-container');
        if (container) container.remove();

        // 디스코드 스타일 화면 공유 미리보기 컨테이너 생성
        container = document.createElement('div');
        container.id = 'screen-share-container';
        container.className = 'screen-share-container';

        const userName = this.app.auth?.currentUser?.name || '나';

        container.innerHTML = `
            <div class="screen-share-header">
                <span class="screen-share-username">${userName}님이 화면을 공유 중입니다</span>
                <div class="screen-share-controls">
                    <button class="share-control-btn" id="btn-minimize-share" title="축소">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M20 12H4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <button class="share-control-btn" id="btn-fullscreen-share" title="전체 화면">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <button class="share-control-btn danger" id="btn-end-share" title="공유 중지">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="screen-share-video-wrapper">
                <video id="shared-screen-video" autoplay muted></video>
            </div>
        `;

        // 채팅 영역에 추가
        const chatArea = document.querySelector('.chat-content') || document.body;
        chatArea.prepend(container);

        // 비디오 스트림 설정
        const videoStream = stream || this.localStream;
        const video = document.getElementById('shared-screen-video');
        if (video && videoStream) {
            // 기존 재생 중지 및 정리
            if (video.srcObject) {
                video.pause();
                video.srcObject = null;
            }
            
            // 새로운 스트림 설정
            video.srcObject = videoStream;
            
            // 비디오 로드 후 재생
            video.load();
            video.play().catch(e => {
                // AbortError는 무시 (새로운 로드 요청으로 인한 정상적인 중단)
                if (e.name !== 'AbortError') {
                    console.error('[WebRTC] Video play error:', e);
                }
            });
        }

        // 이벤트 바인딩
        document.getElementById('btn-end-share').onclick = () => this.stopScreenShare();
        document.getElementById('btn-fullscreen-share').onclick = () => this.toggleFullscreen();
        document.getElementById('btn-minimize-share').onclick = () => this.toggleMinimizeShare();
    }

    // 화면 공유 축소/확대 토글
    toggleMinimizeShare() {
        const container = document.getElementById('screen-share-container');
        if (container) {
            container.classList.toggle('minimized');
        }
    }

    hideScreenSharePreview() {
        // 디스코드 스타일: 채팅 영역의 화면 공유 컨테이너 숨기기
        const container = document.getElementById('screen-share-container');
        const video = document.getElementById('shared-screen-video');

        if (container) {
            container.style.display = 'none';
            container.classList.remove('fullscreen');
        }

        if (video) {
            video.srcObject = null;
        }

        // 이전 화면 공유 모달도 닫기
        const modal = document.getElementById('screen-share-modal');
        const options = document.querySelector('.screen-share-options');
        const preview = document.getElementById('screen-preview');

        if (modal) modal.style.display = 'none';
        if (options) options.style.display = 'grid';
        if (preview) preview.style.display = 'none';
    }

    toggleFullscreen() {
        const container = document.getElementById('screen-share-container');
        if (container) {
            // 축소 상태면 해제
            container.classList.remove('minimized');
            container.classList.toggle('fullscreen');
        }
    }

    // 디스코드 스타일 통화 컨트롤 바 표시
    showCallControlBar() {
        const controlBar = document.getElementById('call-control-bar');
        if (controlBar) {
            controlBar.style.display = 'flex';
        }

        // 사용자 이니셜 설정
        const userInitial = document.getElementById('call-user-initial');
        const currentUser = this.app.auth?.currentUser;
        if (userInitial && currentUser) {
            userInitial.textContent = currentUser.name ? currentUser.name[0] : 'U';
        }

        // 채널 이름 표시
        const channelName = document.getElementById('call-channel-name');
        const currentChannel = this.app.serverManager.currentChannel;
        if (channelName && currentChannel) {
            channelName.textContent = `🔊 ${currentChannel.name}`;
        }

        // 통화 타이머 시작
        this.startCallTimer();
    }

    // 디스코드 스타일 통화 컨트롤 바 숨김
    hideCallControlBar() {
        const controlBar = document.getElementById('call-control-bar');
        if (controlBar) {
            controlBar.style.display = 'none';
        }

        // 타이머 중지
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
    }

    // 통화 타이머
    startCallTimer() {
        this.callStartTime = Date.now();
        const timerEl = document.getElementById('call-timer');

        this.callTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            if (timerEl) {
                timerEl.textContent = `${minutes}:${seconds}`;
            }
        }, 1000);
    }

    // 마이크 토글
    toggleMicrophone() {
        console.log('[WebRTC] toggleMicrophone called, localStream:', !!this.localStream);

        if (!this.localStream) {
            console.log('[WebRTC] No local stream');
            return;
        }

        const audioTrack = this.localStream.getAudioTracks()[0];
        console.log('[WebRTC] audioTrack:', audioTrack, 'enabled:', audioTrack?.enabled);

        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            console.log('[WebRTC] audioTrack.enabled now:', audioTrack.enabled);

            const btn = document.getElementById('btn-toggle-mic');
            if (btn) {
                if (audioTrack.enabled) {
                    btn.classList.remove('muted');
                } else {
                    btn.classList.add('muted');
                }
            }
        }
    }

    // 헤드셋(스피커) 토글
    toggleHeadset() {
        this.isDeafened = !this.isDeafened;

        const btn = document.getElementById('btn-toggle-headset');
        if (btn) {
            btn.classList.toggle('muted', this.isDeafened);
        }

        // 모든 원격 오디오 음소거/해제
        document.querySelectorAll('audio, video').forEach(el => {
            if (!el.muted || el.id === 'local-video') return;
            el.muted = this.isDeafened;
        });

        // 헤드셋을 끄면 마이크도 같이 끔
        if (this.isDeafened && this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack && audioTrack.enabled) {
                audioTrack.enabled = false;
                const micBtn = document.getElementById('btn-toggle-mic');
                if (micBtn) micBtn.classList.add('muted');
            }
        }
    }
    async handleUserJoined(data) {
        // Only if we are not in a call, show incoming call modal
        if (!this.isCallActive) {
            this.showIncomingCallModal(data.callerId);
            return;
        }

        // If already in call, just connect
        const targetSid = data.callerId;
        // SOLID: PeerConnectionManager를 통해 확인
        if (this.peerConnectionManager.exists(targetSid)) return; // already connected

        console.log('User joined call:', targetSid);
        await this.createPeerConnection(targetSid, true);
    }

    showIncomingCallModal(callerId) {
        // Prevent multiple modals
        if (document.getElementById('incoming-call-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'incoming-call-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content call-modal">
                <h3>Incoming Call</h3>
                <p>User ${callerId.substr(0, 4)} is calling...</p>
                <div class="call-actions">
                    <button id="btn-accept-call" class="auth-btn primary">Accept</button>
                    <button id="btn-reject-call" class="auth-btn secondary">Decline</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-accept-call').onclick = () => {
            modal.remove();
            this.startCall(); // Join the call
        };

        document.getElementById('btn-reject-call').onclick = () => {
            modal.remove();
        };
    }

    // 레거시 핸들러 함수들은 위에 정의된 handleOffer, handleAnswer, handleIceCandidate를 사용

    handleUserLeft(data) {
        // data.id (sid)
        const targetSid = data.id;
        console.log('User left call:', targetSid);
        this.closePeerConnection(targetSid);
        this.removeRemoteVideo(targetSid);
    }

    async createPeerConnection(targetSid, isInitiator) {
        // SOLID: PeerConnectionManager를 통해 생성
        // 이미 존재하면 반환
        if (this.peerConnectionManager.exists(targetSid)) {
            return this.peerConnectionManager.get(targetSid);
        }
        
        const pc = this.peerConnectionManager.create(targetSid, isInitiator);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.app.socketManager.emit('ice_candidate', {
                    targetSid: targetSid,
                    candidate: event.candidate,
                    channelId: this.app.serverManager.currentChannel?.id
                });
            }
        };

        pc.ontrack = (event) => {
            console.log('[WebRTC] 🎬 ontrack event received from (legacy):', targetSid);
            console.log('[WebRTC] Event details:', {
                streams: event.streams?.length || 0,
                track: event.track ? {
                    kind: event.track.kind,
                    id: event.track.id,
                    enabled: event.track.enabled,
                    readyState: event.track.readyState
                } : null
            });
            
            // handleRemoteStream을 사용하여 비디오/오디오 트랙을 적절히 처리
            if (event.streams && event.streams.length > 0) {
                const stream = event.streams[0];
                console.log('[WebRTC] ✅ Stream found in ontrack (legacy):', stream.id, 'tracks:', stream.getTracks().map(t => `${t.kind}:${t.id}`));
                
                // 중복 처리 방지: 같은 스트림이 이미 처리되었는지 확인
                const streamId = stream.id || `${targetSid}_${Date.now()}`;
                const lastTrackKey = `lastTrack_${targetSid}`;
                
                // 같은 스트림 ID를 가진 트랙이 최근에 처리되었는지 확인 (1초 내)
                const now = Date.now();
                const lastTrackTime = this[`lastTrackTime_${targetSid}`] || 0;
                if (this[lastTrackKey] === streamId && (now - lastTrackTime) < 1000) {
                    console.log('[WebRTC] ⚠️ Duplicate track event, skipping');
                    return;
                }
                this[lastTrackKey] = streamId;
                this[`lastTrackTime_${targetSid}`] = now;
                
                this.handleRemoteStream(targetSid, stream);
            } else if (event.track) {
                // streams가 없지만 track이 있는 경우 (일부 브라우저)
                console.log('[WebRTC] ⚠️ No streams but track exists (legacy), creating stream');
                const stream = new MediaStream([event.track]);
                this.handleRemoteStream(targetSid, stream);
            } else {
                console.warn('[WebRTC] ❌ No streams or track in ontrack event (legacy)');
            }
        };

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.app.socketManager.emit('offer', {
                targetSid: targetSid,
                sdp: offer,
                channelId: this.app.serverManager.currentChannel?.id
            });
        }

        return pc;
    }

    closePeerConnection(sid) {
        // SOLID: PeerConnectionManager를 통해 관리
        this.peerConnectionManager.close(sid);
    }

    leaveCall() {
        if (!this.isCallActive) return;

        // Stop Audio Visualizer
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Stop screen stream if active
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Close all peer connections
        this.peerConnectionManager.closeAll();

        // Remove UI
        this.hideCallOverlay();
        this.hideCallControlBar();
        this.hideScreenSharePreview();

        // 말하는 표시 제거
        const callAvatar = document.getElementById('call-user-avatar');
        if (callAvatar) callAvatar.classList.remove('speaking');

        // 버튼 상태 초기화
        document.getElementById('btn-toggle-mic')?.classList.remove('muted');
        document.getElementById('btn-toggle-headset')?.classList.remove('muted');
        this.isDeafened = false;

        // 음성 채널 활성 상태 제거
        document.querySelectorAll('.channel-item.voice-channel').forEach(el => {
            el.classList.remove('active', 'connected');
        });

        // 참가자 목록에서 현재 사용자 제거
        const channelId = this.app.serverManager.currentChannel?.id;
        const userId = this.app.auth?.currentUser?.id;
        if (channelId && userId) {
            this.app.serverManager.removeVoiceParticipant(channelId, userId);
        }

        // Notify others
        const serverId = this.app.serverManager.currentServer?.id;
        if (channelId) {
            this.app.socketManager.emit('call_leave', { channelId, serverId });
        }

        this.isCallActive = false;
        this.updateConnectionState("Disconnected");
        console.log('[WebRTC] Left call successfully');
    }

    // UI Methods
    showCallOverlay() {
        let overlay = document.getElementById('call-overlay');
        if (!overlay) {
            this.createCallOverlay();
            overlay = document.getElementById('call-overlay');
        }
        overlay.style.display = 'flex';
    }

    hideCallOverlay() {
        const overlay = document.getElementById('call-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            // Clear video grid content
            const grid = document.getElementById('video-grid');
            if (grid) grid.innerHTML = '';
        }
    }

    updateConnectionState(state) {
        const el = document.getElementById('call-status-text');
        if (el) el.textContent = state;
    }

    createCallOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'call-overlay';
        overlay.className = 'call-overlay floating';
        overlay.style.display = 'none'; // Hidden by default

        const channelName = this.app.serverManager?.currentChannel?.name || 'Voice Chat';

        overlay.innerHTML = `
            <div class="call-header" id="call-drag-handle">
                <div class="call-header-left">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <h3 id="call-channel-title">${channelName}</h3>
                </div>
                <div class="call-header-controls">
                    <span id="call-status-text" class="status-badge connecting">Connecting...</span>
                    <button id="minimize-btn" class="header-control-btn" title="Minimize">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                        </svg>
                    </button>
                </div>
            </div>
            <div id="call-content" class="call-content">
                <div id="video-grid" class="video-grid">
                    <!-- Videos will be injected here -->
                </div>
                <div class="visualizer-container">
                    <canvas id="audio-visualizer" width="300" height="50"></canvas>
                </div>
                <div class="call-controls discord-style">
                    <button id="mute-btn" class="control-btn" title="마이크 음소거">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>
                    <button id="video-btn" class="control-btn" title="비디오 켜기/끄기">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <button id="screen-share-btn" class="control-btn" title="화면 공유">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <rect x="2" y="3" width="20" height="14" rx="2" stroke-width="2"/>
                            <path d="M8 21h8M12 17v4" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <button id="hangup-btn" class="control-btn danger" title="통화 종료">
                         <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Bind events
        document.getElementById('hangup-btn').onclick = () => this.leaveCall();
        document.getElementById('mute-btn').onclick = (e) => this.toggleAudio(e.currentTarget);
        document.getElementById('video-btn').onclick = (e) => this.toggleVideo(e.currentTarget);
        document.getElementById('screen-share-btn').onclick = () => this.startScreenShare();
        document.getElementById('minimize-btn').onclick = () => this.toggleMinimize();

        // Make draggable
        this.makeDraggable(overlay, document.getElementById('call-drag-handle'));
    }

    setupAudioVisualizer(stream) {
        if (!stream.getAudioTracks().length) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);

        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);

        const canvas = document.getElementById('audio-visualizer');
        const canvasCtx = canvas ? canvas.getContext('2d') : null;
        const WIDTH = canvas?.width || 0;
        const HEIGHT = canvas?.height || 0;

        const draw = () => {
            if (!this.isCallActive) return;
            this.animationId = requestAnimationFrame(draw);

            this.analyser.getByteFrequencyData(this.dataArray);

            // 평균 볼륨 계산
            const average = this.dataArray.reduce((a, b) => a + b, 0) / bufferLength;

            // 말하는 중인지 감지 (임계값: 30)
            const isSpeaking = average > 30;
            this.updateSpeakingIndicator('local', isSpeaking);

            // 캔버스가 있으면 비주얼라이저 그리기
            if (canvasCtx) {
                canvasCtx.fillStyle = '#0a0a0f';
                canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

                const barWidth = (WIDTH / bufferLength) * 2.5;
                let barHeight;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    barHeight = this.dataArray[i] / 2;

                    canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 250)`;
                    canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

                    x += barWidth + 1;
                }
            }
        };

        draw();
    }

    // 말하는 사람 표시 업데이트
    updateSpeakingIndicator(id, isSpeaking) {
        // 비디오 컨테이너에 표시
        const container = id === 'local'
            ? document.querySelector('.video-container.local')
            : document.querySelector(`.video-container[data-sid="${id}"]`);

        if (container) {
            if (isSpeaking) {
                container.classList.add('speaking');
            } else {
                container.classList.remove('speaking');
            }
        }

        // 컨트롤 바의 사용자 아바타에 표시 (본인인 경우)
        if (id === 'local') {
            const callAvatar = document.getElementById('call-user-avatar');
            if (callAvatar) {
                if (isSpeaking) {
                    callAvatar.classList.add('speaking');
                } else {
                    callAvatar.classList.remove('speaking');
                }
            }
        }

        // 음성 채널 참가자 목록에서도 표시
        const participantEl = document.querySelector(`.voice-participant[data-user-id="${id}"]`);
        if (participantEl) {
            if (isSpeaking) {
                participantEl.classList.add('speaking');
            } else {
                participantEl.classList.remove('speaking');
            }
        }
    }

    addLocalVideo() {
        const video = document.createElement('video');
        video.srcObject = this.localStream;
        video.autoplay = true;
        video.muted = true; // Mute local video
        video.id = 'local-video';
        video.className = 'video-item local';

        const container = document.createElement('div');
        container.className = 'video-container local';
        container.appendChild(video);
        container.innerHTML += '<div class="video-label">Me</div>';

        document.getElementById('video-grid').appendChild(container);
    }

    addRemoteVideo(sid, stream) {
        // video-grid 요소 확인
        let videoGrid = document.getElementById('video-grid');
        
        // video-grid가 없으면 call-overlay 생성
        if (!videoGrid) {
            console.log('[WebRTC] video-grid not found, creating call overlay');
            this.showCallOverlay();
            videoGrid = document.getElementById('video-grid');
        }
        
        // 여전히 없으면 오류 로그만 남기고 반환
        if (!videoGrid) {
            console.error('[WebRTC] Cannot find video-grid element');
            return;
        }

        let container = document.getElementById(`video-container-${sid}`);
        if (!container) {
            container = document.createElement('div');
            container.id = `video-container-${sid}`;
            container.className = 'video-container';

            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.playsInline = true;
            video.className = 'video-item';

            container.appendChild(video);
            const label = document.createElement('div');
            label.className = 'video-label';
            label.textContent = `User ${sid.substr(0, 4)}`;
            container.appendChild(label);

            // Re-attach video because innerHTML might have wiped it
            const v = container.querySelector('video');
            if (v) {
                // 기존 재생 중지 및 정리
                if (v.srcObject) {
                    v.pause();
                    v.srcObject = null;
                }
                
                v.srcObject = stream;
                v.load();
                v.play().catch(e => {
                    // AbortError는 무시 (새로운 로드 요청으로 인한 정상적인 중단)
                    if (e.name !== 'AbortError') {
                        console.error('[WebRTC] Video play error:', e);
                    }
                });
            }

            videoGrid.appendChild(container);
            console.log('[WebRTC] Added remote video container for:', sid);
        } else {
            // 기존 컨테이너가 있으면 비디오 스트림만 업데이트
            const video = container.querySelector('video');
            if (video) {
                // 기존 재생 중지 및 정리
                if (video.srcObject) {
                    video.pause();
                    video.srcObject = null;
                }
                
                video.srcObject = stream;
                video.load();
                video.play().catch(e => {
                    // AbortError는 무시 (새로운 로드 요청으로 인한 정상적인 중단)
                    if (e.name !== 'AbortError') {
                        console.error('[WebRTC] Video play error:', e);
                    }
                });
            }
        }
    }

    removeRemoteVideo(sid) {
        const container = document.getElementById(`video-container-${sid}`);
        if (container) container.remove();
    }

    toggleAudio(btn) {
        if (this.localStream) {
            const track = this.localStream.getAudioTracks()[0];
            track.enabled = !track.enabled;
            btn.classList.toggle('off', !track.enabled);
        }
    }

    toggleVideo(btn) {
        if (this.localStream) {
            const track = this.localStream.getVideoTracks()[0];
            track.enabled = !track.enabled;
            btn.classList.toggle('off', !track.enabled);
        }
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        const overlay = document.getElementById('call-overlay');
        const content = document.getElementById('call-content');
        const minimizeBtn = document.getElementById('minimize-btn');

        if (this.isMinimized) {
            overlay.classList.add('minimized');
            content.style.display = 'none';
            // 오른쪽 아래로 고정
            overlay.style.top = 'auto';
            overlay.style.left = 'auto';
            overlay.style.right = '24px';
            overlay.style.bottom = '24px';
            minimizeBtn.innerHTML = `
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
            `;
            minimizeBtn.title = 'Maximize';
        } else {
            overlay.classList.remove('minimized');
            content.style.display = 'flex';
            // 최대화 시에도 오른쪽 아래 유지 (드래그 가능)
            overlay.style.top = 'auto';
            overlay.style.left = 'auto';
            overlay.style.right = '24px';
            overlay.style.bottom = '24px';
            minimizeBtn.innerHTML = `
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                </svg>
            `;
            minimizeBtn.title = 'Minimize';
        }
    }

    makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.bottom = 'auto';
            element.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
}

export class WebRTCManager {
    constructor(app) {
        this.app = app;
        this.localStream = null;
        this.screenStream = null; // 화면 공유 스트림
        this.peers = {}; // sid -> RTCPeerConnection
        this.isCallActive = false;
        this.isMinimized = false;
        this.isDeafened = false; // 헤드셋 음소거 상태

        // Audio Context for Visualizer
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;

        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        this.bindEvents();
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
    }

    stopScreenShare() {
        // 화면 공유만 종료하고 통화는 유지
        this.hideScreenSharePreview();
        // 화면 공유 스트림이 있으면 트랙 중지
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
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

    async startScreenShare() {
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

            // 화면 공유 버튼 active 상태
            const shareBtn = document.getElementById('btn-screen-share-call');
            if (shareBtn) shareBtn.classList.add('active');

            // 화면 공유 종료 시 처리
            videoTrack.onended = () => {
                this.hideScreenSharePreview();
                this.screenStream = null;
                // 참가자 목록에서 화면 공유 표시 제거
                if (channelId && userId) {
                    this.app.serverManager.updateParticipantScreenShare(channelId, userId, false);
                }
                // 컨트롤 바 상태 업데이트
                this.updateScreenShareStatus(false);
                if (shareBtn) shareBtn.classList.remove('active');
            };

        } catch (err) {
            console.error('[WebRTC] Screen share error:', err);
            this.updateConnectionState("Screen share failed");
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

            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                }
            });

            this.isCallActive = true;

            // 화면 공유 모달에 미리보기 표시
            this.showScreenSharePreview();
            this.setupAudioVisualizer(this.localStream);

            // 참가자 목록에 화면 공유 표시
            const userId = this.app.auth?.currentUser?.id;
            console.log('[WebRTC] Screen share - channelId:', channelId, 'userId:', userId);
            if (channelId && userId) {
                this.app.serverManager.updateParticipantScreenShare(channelId, userId, true);
            }

            // 컨트롤 바에 화면 공유 상태 표시
            this.updateScreenShareStatus(true);

            // 화면 공유 버튼 active 상태
            const shareBtn = document.getElementById('btn-screen-share-call');
            if (shareBtn) shareBtn.classList.add('active');

            this.app.socketManager.emit('call_join', { currentChannelId: channelId });
            this.updateConnectionState("Screen Sharing");

            if (this.localStream.getVideoTracks().length > 0) {
                this.localStream.getVideoTracks()[0].onended = () => {
                    // 화면 공유 종료 시 상태 업데이트
                    if (channelId && userId) {
                        this.app.serverManager.updateParticipantScreenShare(channelId, userId, false);
                    }
                    this.updateScreenShareStatus(false);
                    if (shareBtn) shareBtn.classList.remove('active');
                    this.stopScreenShare();
                };
            }
        } catch (err) {
            console.error('[WebRTC] Error starting screen share:', err);
            this.updateConnectionState("Failed to share screen");
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

            // Join call room
            this.app.socketManager.emit('call_join', { currentChannelId: channelId });
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
            video.srcObject = videoStream;
            video.play().catch(e => console.error('[WebRTC] Video play error:', e));
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
        if (this.peers[targetSid]) return; // already connected

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

    async handleOffer(data) {
        // data: { sdp, callerId, channelId }
        const targetSid = data.callerId;
        console.log('Received offer from:', targetSid);

        // If not in call (e.g. accepted via modal just now or re-negotiating)
        if (!this.isCallActive) {
            // Implicitly accept if we receive offer? No, usually handled by join.
            // But if we are here, we probably joined.
        }

        const pc = await this.createPeerConnection(targetSid, false);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.app.socketManager.emit('answer', {
            targetSid: targetSid,
            sdp: answer,
            channelId: data.channelId
        });
    }

    async handleAnswer(data) {
        // data: { sdp, callerId }
        const targetSid = data.callerId;
        const pc = this.peers[targetSid];
        if (pc) {
            console.log('Received answer from:', targetSid);
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
    }

    async handleIceCandidate(data) {
        // data: { candidate, callerId }
        const targetSid = data.callerId;
        const pc = this.peers[targetSid];
        if (pc && data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
    }

    handleUserLeft(data) {
        // data.id (sid)
        const targetSid = data.id;
        console.log('User left call:', targetSid);
        this.closePeerConnection(targetSid);
        this.removeRemoteVideo(targetSid);
    }

    async createPeerConnection(targetSid, isInitiator) {
        const pc = new RTCPeerConnection(this.iceServers);
        this.peers[targetSid] = pc;

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
            console.log('Received remote track from:', targetSid);
            this.addRemoteVideo(targetSid, event.streams[0]);
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
        const pc = this.peers[sid];
        if (pc) {
            pc.close();
            delete this.peers[sid];
        }
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
        Object.keys(this.peers).forEach(sid => this.closePeerConnection(sid));
        this.peers = {};

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
        if (channelId) {
            this.app.socketManager.emit('call_leave', { channelId });
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
        let container = document.getElementById(`video-container-${sid}`);
        if (!container) {
            container = document.createElement('div');
            container.id = `video-container-${sid}`;
            container.className = 'video-container';

            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.className = 'video-item';

            container.appendChild(video);
            container.innerHTML += `<div class="video-label">User ${sid.substr(0, 4)}</div>`;

            // Re-attach because innerHTML wiped it
            const v = container.querySelector('video');
            v.srcObject = stream;

            document.getElementById('video-grid').appendChild(container);
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

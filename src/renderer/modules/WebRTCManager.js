export class WebRTCManager {
    constructor(app) {
        this.app = app;
        this.localStream = null;
        this.peers = {}; // sid -> RTCPeerConnection
        this.isCallActive = false;
        this.isMinimized = false;

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
            this.leaveCall();
        });
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
        if (this.isCallActive) return;
        this.updateConnectionState("Starting Screen Share...");

        // Get available screen sources from Electron
        if (window.electronAPI && window.electronAPI.getScreenSources) {
            try {
                const sources = await window.electronAPI.getScreenSources();
                if (sources && sources.length > 0) {
                    this.showSourcePicker(sources);
                    return;
                }
            } catch (err) {
                console.log('Using fallback getDisplayMedia:', err);
            }
        }

        // Fallback to browser API
        await this.initiateMedia(true);
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
            this.showCallOverlay();
            this.addLocalVideo();
            this.setupAudioVisualizer(this.localStream);

            this.app.socketManager.emit('call_join', { currentChannelId: channelId });
            this.updateConnectionState("Screen Sharing");

            if (this.localStream.getVideoTracks().length > 0) {
                this.localStream.getVideoTracks()[0].onended = () => {
                    this.leaveCall();
                };
            }
        } catch (err) {
            console.error('Error starting screen share:', err);
            this.updateConnectionState("Failed to share screen");
        }
    }

    async initiateMedia(isScreen) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return;

        try {
            if (isScreen) {
                // Screen Sharing (fallback)
                this.localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
            } else {
                // Webcam
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
            }

            this.isCallActive = true;
            this.showCallOverlay();
            this.addLocalVideo();
            this.setupAudioVisualizer(this.localStream);

            // Join call room
            this.app.socketManager.emit('call_join', { currentChannelId: channelId });
            this.updateConnectionState("Connected");

            // Handle stream stop (e.g. user clicks "Stop Sharing")
            if (this.localStream.getVideoTracks().length > 0) {
                this.localStream.getVideoTracks()[0].onended = () => {
                    this.leaveCall();
                };
            }

        } catch (err) {
            console.error('Error accessing media:', err);
            this.updateConnectionState("Failed to access media");
            // alert('Media access failed or cancelled.');
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

        // Close all peer connections
        Object.keys(this.peers).forEach(sid => this.closePeerConnection(sid));
        this.peers = {};

        // Remove UI
        this.hideCallOverlay();

        // Notify others
        const channelId = this.app.serverManager.currentChannel?.id;
        if (channelId) {
            this.app.socketManager.emit('call_leave', { channelId });
        }

        this.isCallActive = false;
        this.updateConnectionState("Disconnected");
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

        overlay.innerHTML = `
            <div class="call-header" id="call-drag-handle">
                <h3>Voice/Video Call</h3>
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
                <div class="call-controls">
                    <button id="mute-btn" class="control-btn" title="Toggle Mute">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>
                    <button id="video-btn" class="control-btn" title="Toggle Video">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <button id="hangup-btn" class="control-btn danger" title="Hang Up">
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
        if (!canvas) return;
        const canvasCtx = canvas.getContext('2d');
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        const draw = () => {
            if (!this.isCallActive) return;
            this.animationId = requestAnimationFrame(draw);

            this.analyser.getByteFrequencyData(this.dataArray);

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
        };

        draw();
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

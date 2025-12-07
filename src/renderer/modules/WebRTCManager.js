export class WebRTCManager {
    constructor(app) {
        this.app = app;
        this.localStream = null;
        this.peers = {}; // sid -> RTCPeerConnection
        this.isCallActive = false;

        // ICE Server config (using public STUN for demo)
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    async startCall() {
        if (this.isCallActive) return;

        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return;

        try {
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            this.isCallActive = true;
            this.showCallOverlay();
            this.addLocalVideo();

            // Join call room
            this.app.socketManager.emit('call_join', { currentChannelId: channelId });

        } catch (err) {
            console.error('Error starting call:', err);
            alert('Could not access camera/microphone');
        }
    }

    async handleUserJoined(data) {
        // data.callerId (sid of new user)
        const targetSid = data.callerId;
        if (this.peers[targetSid]) return; // already connected

        console.log('User joined call:', targetSid);
        await this.createPeerConnection(targetSid, true);
    }

    async handleOffer(data) {
        // data: { sdp, callerId, channelId }
        const targetSid = data.callerId;
        console.log('Received offer from:', targetSid);

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

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close all peer connections
        Object.keys(this.peers).forEach(sid => this.closePeerConnection(sid));

        // Remove UI
        this.hideCallOverlay();

        // Notify others
        const channelId = this.app.serverManager.currentChannel?.id;
        if (channelId) {
            this.app.socketManager.emit('call_leave', { channelId });
        }

        this.isCallActive = false;
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

    createCallOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'call-overlay';
        overlay.className = 'call-overlay';
        overlay.style.display = 'none'; // Hidden by default

        overlay.innerHTML = `
            <div class="call-header">
                <h3>Voice/Video Call</h3>
                <button id="hangup-btn" class="danger-btn">Hang Up</button>
            </div>
            <div id="video-grid" class="video-grid">
                <!-- Videos will be injected here -->
            </div>
            <div class="call-controls">
                <button id="mute-btn" class="control-btn">Mute</button>
                <button id="video-btn" class="control-btn">Video Off</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Bind events
        document.getElementById('hangup-btn').onclick = () => this.leaveCall();
        document.getElementById('mute-btn').onclick = (e) => this.toggleAudio(e.target);
        document.getElementById('video-btn').onclick = (e) => this.toggleVideo(e.target);
    }

    addLocalVideo() {
        const video = document.createElement('video');
        video.srcObject = this.localStream;
        video.autoplay = true;
        video.muted = true; // Mute local video to prevent echo
        video.id = 'local-video';
        video.className = 'video-item local';

        const container = document.createElement('div');
        container.className = 'video-container';
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
            // Ideally map sid to user name, but simpler for now
            container.innerHTML += `<div class="video-label">User ${sid.substr(0, 4)}</div>`;

            // Re-attach video element after innerHTML overwrite (or just append label separately)
            const v = container.querySelector('video');
            v.srcObject = stream; // set again

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
            btn.textContent = track.enabled ? 'Mute' : 'Unmute';
            btn.classList.toggle('active', !track.enabled);
        }
    }

    toggleVideo(btn) {
        if (this.localStream) {
            const track = this.localStream.getVideoTracks()[0];
            track.enabled = !track.enabled;
            btn.textContent = track.enabled ? 'Video Off' : 'Video On';
            btn.classList.toggle('active', !track.enabled);
        }
    }
}

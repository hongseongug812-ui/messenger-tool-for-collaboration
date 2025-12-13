/**
 * ScreenShareManager - Single Responsibility: 화면 공유 관리
 * SRP: 화면 공유 시작/종료 및 스트림 관리만 담당
 */
export class ScreenShareManager {
    constructor(mediaStreamManager, peerConnectionManager, socketManager, serverManager, app) {
        this.mediaStreamManager = mediaStreamManager;
        this.peerConnectionManager = peerConnectionManager;
        this.socketManager = socketManager;
        this.serverManager = serverManager;
        this.app = app;
    }

    /**
     * 화면 공유 시작 (소스 선택)
     */
    async start() {
        try {
            // Electron 환경에서 소스 선택
            if (window.electronAPI && window.electronAPI.getScreenSources) {
                const sources = await window.electronAPI.getScreenSources();
                if (sources && sources.length > 0) {
                    this.showSourcePicker(sources);
                    return;
                }
            }

            // 브라우저 환경 또는 소스 선택 실패 시 직접 시작
            await this.startWithSource(null);
        } catch (error) {
            console.error('[ScreenShare] Error starting screen share:', error);
            throw error;
        }
    }

    /**
     * 특정 소스로 화면 공유 시작
     * @param {string|null} sourceId - 화면 소스 ID (null이면 getDisplayMedia 사용)
     */
    async startWithSource(sourceId) {
        let screenStream;

        if (window.electronAPI && sourceId) {
            console.log('[ScreenShare] Using Electron desktopCapturer with sourceId:', sourceId);
            try {
                if (window.electronAPI.getDisplayMediaStream) {
                    screenStream = await window.electronAPI.getDisplayMediaStream(sourceId);
                } else {
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
                }
            } catch (electronErr) {
                console.warn('[ScreenShare] Electron method failed:', electronErr);
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always' },
                    audio: false
                });
            }
        } else {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
        }

        this.mediaStreamManager.setScreenStream(screenStream);

        // 모든 피어에 화면 공유 스트림 추가
        this.addScreenShareToPeers();

        // 화면 공유 시작 알림
        const channelId = this.serverManager.currentChannel?.id;
        const currentUser = this.app?.auth?.currentUser;
        const serverId = this.serverManager.currentServer?.id;

        // socket ID 가져오기
        let callerId = null;
        if (this.socketManager && this.socketManager.socket) {
            callerId = this.socketManager.socket.id;
        } else if (window.electronAPI && window.electronAPI.getSocketId) {
            callerId = await window.electronAPI.getSocketId();
        }

        this.socketManager.emit('screen_share_started', {
            channelId: channelId,
            serverId: serverId,
            userId: currentUser?.id,
            callerId: callerId
        });

        // 화면 공유 종료 이벤트 처리
        screenStream.getVideoTracks()[0].onended = () => {
            this.stop();
        };

        // UI 업데이트 - 화면 공유 미리보기 표시
        // WebRTCManager를 통해 UI 업데이트
        if (this.app && this.app.webRTCManager) {
            if (typeof this.app.webRTCManager.showScreenSharePreview === 'function') {
                this.app.webRTCManager.showScreenSharePreview(screenStream);
            } else if (this.app.webRTCManager.uiController) {
                this.app.webRTCManager.uiController.showScreenSharePreview(screenStream);
            }
        }

        console.log('[ScreenShare] ✅ Screen share started');
    }

    /**
     * 화면 공유 종료
     */
    stop() {
        const screenStream = this.mediaStreamManager.getScreenStream();
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            this.mediaStreamManager.stopScreenStream();
        }

        // 모든 피어에서 화면 공유 트랙 제거
        const peers = this.peerConnectionManager.getAll();
        Object.keys(peers).forEach(sid => {
            const pc = peers[sid];
            if (pc && pc.senders) {
                pc.getSenders().forEach(sender => {
                    if (sender.track && sender.track.kind === 'video') {
                        pc.removeTrack(sender);
                    }
                });
            }
        });

        // 화면 공유 종료 알림
        const channelId = this.serverManager.currentChannel?.id;
        const currentUser = this.app?.auth?.currentUser;

        this.socketManager.emit('screen_share_stopped', {
            channelId: channelId,
            userId: currentUser?.id,
            callerId: this.socketManager.socket?.id
        });

        console.log('[ScreenShare] ✅ Screen share stopped');
    }

    /**
     * 모든 피어에 화면 공유 스트림 추가 (Discord 스타일 - 즉시 재협상)
     */
    async addScreenShareToPeers() {
        const screenStream = this.mediaStreamManager.getScreenStream();
        if (!screenStream) {
            console.error('[ScreenShare] No screen stream to add');
            return;
        }

        const videoTrack = screenStream.getVideoTracks()[0];
        if (!videoTrack) {
            console.error('[ScreenShare] No video track in screen stream');
            return;
        }

        const peers = this.peerConnectionManager.getAll();
        const peerEntries = Object.entries(peers);
        
        console.log('[ScreenShare] 🚀 Adding screen share to', peerEntries.length, 'peers');

        // 모든 피어에 동시에 처리 (Discord처럼 즉시)
        await Promise.all(peerEntries.map(async ([sid, pc]) => {
            if (!pc || pc.signalingState === 'closed') {
                console.log('[ScreenShare] Skipping closed peer:', sid);
                return;
            }

            try {
                const senders = pc.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                
                if (videoSender) {
                    // 기존 비디오 트랙 교체 (Discord는 즉시 교체)
                    console.log('[ScreenShare] Replacing video track for:', sid);
                    await videoSender.replaceTrack(videoTrack);
                    console.log('[ScreenShare] ✅ Track replaced for:', sid);
                } else {
                    // 새 비디오 트랙 추가
                    console.log('[ScreenShare] Adding new video track for:', sid);
                    pc.addTrack(videoTrack, screenStream);
                    console.log('[ScreenShare] ✅ Track added for:', sid);
                }

                // Discord처럼 즉시 재협상 (상태와 관계없이)
                console.log('[ScreenShare] 🔄 Triggering renegotiation for:', sid, 'state:', pc.signalingState);
                
                try {
                    // offer 생성 전에 트랙이 제대로 추가되었는지 확인
                    const senders = pc.getSenders();
                    const videoSenders = senders.filter(s => s.track && s.track.kind === 'video');
                    console.log('[ScreenShare] Video senders count:', videoSenders.length);
                    
                    const offer = await pc.createOffer();
                    console.log('[ScreenShare] Offer created, SDP contains video:', offer.sdp.includes('m=video'));
                    await pc.setLocalDescription(offer);
                    
                    const channelId = this.serverManager.currentChannel?.id;
                    this.socketManager.emit('webrtc_offer', {
                        targetSid: sid,
                        offer: offer,
                        channelId: channelId
                    });
                    console.log('[ScreenShare] ✅ Offer sent for:', sid);
                } catch (err) {
                    console.error('[ScreenShare] ❌ Error creating/sending offer for', sid, ':', err);
                }
            } catch (err) {
                console.error('[ScreenShare] ❌ Error processing peer', sid, ':', err);
            }
        }));

        console.log('[ScreenShare] ✅ All peers processed');
    }

    /**
     * 화면 소스 선택 UI 표시
     * @param {Array} sources - 사용 가능한 화면 소스 목록
     */
    showSourcePicker(sources) {
        console.log('[ScreenShare] Showing source picker with', sources.length, 'sources');
        
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('source-picker-modal');
        if (existingModal) existingModal.remove();

        // 모달 생성
        const modal = document.createElement('div');
        modal.id = 'source-picker-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';

        // 소스 목록 HTML 생성 (thumbnail이 NativeImage인 경우 처리)
        const sourcesList = sources.map(source => {
            let thumbnailSrc = '';
            if (source.thumbnail) {
                if (typeof source.thumbnail === 'string') {
                    thumbnailSrc = source.thumbnail;
                } else if (source.thumbnail.toDataURL) {
                    thumbnailSrc = source.thumbnail.toDataURL();
                } else if (source.thumbnail.toPNG) {
                    thumbnailSrc = `data:image/png;base64,${source.thumbnail.toPNG().toString('base64')}`;
                }
            }
            return `
                <div class="source-item" data-id="${source.id}">
                    ${thumbnailSrc ? `<img src="${thumbnailSrc}" alt="${source.name}" />` : '<div style="width:100%;height:100px;background:#ddd;border-radius:4px;margin-bottom:5px;"></div>'}
                    <span>${source.name || 'Unknown'}</span>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>공유할 화면 선택</h3>
                    <button id="close-source-picker" class="modal-close">✕</button>
                </div>
                <div class="source-picker-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 20px; max-height: 400px; overflow-y: auto;">
                    ${sourcesList}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 스타일 추가
        if (!document.getElementById('source-picker-styles')) {
            const style = document.createElement('style');
            style.id = 'source-picker-styles';
            style.textContent = `
                .source-picker-grid .source-item {
                    cursor: pointer;
                    border: 2px solid transparent;
                    border-radius: 8px;
                    padding: 8px;
                    text-align: center;
                    transition: all 0.2s;
                }
                .source-picker-grid .source-item:hover {
                    border-color: var(--primary, #5865f2);
                    background: var(--bg-tertiary, #f5f5f5);
                }
                .source-picker-grid .source-item img {
                    width: 100%;
                    border-radius: 4px;
                    margin-bottom: 5px;
                }
                .source-picker-grid .source-item span {
                    font-size: 12px;
                    color: var(--text-secondary, #666);
                    display: block;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            `;
            document.head.appendChild(style);
        }

        // 이벤트 리스너
        document.getElementById('close-source-picker').onclick = () => modal.remove();

        modal.querySelectorAll('.source-item').forEach(item => {
            item.onclick = async () => {
                const sourceId = item.dataset.id;
                modal.remove();
                await this.startWithSource(sourceId);
            };
        });
    }
}


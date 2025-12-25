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
            // 🔍 Source ID 확인 로그 추가
            console.log('[ScreenShare] 📋 Source ID 확인:');
            console.log('  - sourceId type:', typeof sourceId);
            console.log('  - sourceId value:', sourceId);
            console.log('  - sourceId length:', sourceId?.length);
            console.log('  - sourceId is string:', typeof sourceId === 'string');
            console.log('  - sourceId is truthy:', !!sourceId);

            if (!sourceId || typeof sourceId !== 'string' || sourceId.trim() === '') {
                console.error('[ScreenShare] ❌ Invalid sourceId:', sourceId);
                throw new Error('유효하지 않은 화면 소스 ID입니다.');
            }

            console.log('[ScreenShare] ✅ Source ID 검증 완료, getUserMedia 호출 직전');

            try {
                if (window.electronAPI.getDisplayMediaStream) {
                    screenStream = await window.electronAPI.getDisplayMediaStream(sourceId);
                } else {
                    // Electron Constraints 문법 수정 (mandatory 안에 해상도 포함)
                    const constraints = {
                        audio: false,
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sourceId, // 검증된 sourceId 사용
                                minWidth: 1280,
                                maxWidth: 1920,
                                minHeight: 720,
                                maxHeight: 1080
                            }
                        }
                    };

                    console.log('[ScreenShare] 📤 getUserMedia 호출, constraints:', JSON.stringify(constraints, null, 2));
                    screenStream = await navigator.mediaDevices.getUserMedia(constraints);
                    console.log('[ScreenShare] ✅ getUserMedia 성공, stream:', screenStream);

                    // 스트림 검증
                    if (!screenStream) {
                        throw new Error('스트림을 가져올 수 없습니다.');
                    }

                    const videoTracks = screenStream.getVideoTracks();
                    if (!videoTracks || videoTracks.length === 0) {
                        throw new Error('비디오 트랙을 찾을 수 없습니다.');
                    }

                    console.log('[ScreenShare] ✅ Video track 확인:', {
                        trackId: videoTracks[0].id,
                        label: videoTracks[0].label,
                        enabled: videoTracks[0].enabled,
                        readyState: videoTracks[0].readyState
                    });
                }
            } catch (electronErr) {
                console.warn('[ScreenShare] Electron method failed:', electronErr);
                // Electron에서 실패하면 getDisplayMedia 시도 (최신 Electron에서 지원)
                try {
                    screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: {
                            cursor: 'always',
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            frameRate: { ideal: 30 }
                        },
                        audio: false
                    });
                } catch (displayErr) {
                    console.error('[ScreenShare] getDisplayMedia also failed:', displayErr);
                    throw new Error(`화면 공유를 시작할 수 없습니다: ${displayErr.message || electronErr.message}`);
                }
            }
        } else {
            // 브라우저 환경
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    },
                    audio: false
                });
            } catch (err) {
                console.error('[ScreenShare] getDisplayMedia failed:', err);
                throw new Error(`화면 공유를 시작할 수 없습니다: ${err.message}`);
            }
        }

        this.mediaStreamManager.setScreenStream(screenStream);

        // 🔥 순서 변경: 먼저 screen_share_started 이벤트를 보내서 수신자가 peer connection을 준비하게 함
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

        console.log('[ScreenShare] 📤 Emitting screen_share_started FIRST (before addScreenShareToPeers)');
        this.socketManager.emit('screen_share_started', {
            channelId: channelId,
            userId: currentUser?.id,
            userName: currentUser?.name || 'User',
            callerId: callerId,
            serverId: serverId
        });

        // UI 프리뷰 표시 (🔥 수정: app.webRTCManager.uiController 사용)
        const uiController = this.app?.webRTCManager?.uiController;
        if (uiController) {
            console.log('[ScreenShare] 🖥️ Showing local screen share preview');
            uiController.showScreenSharePreview(screenStream);
        } else {
            console.warn('[ScreenShare] ⚠️ UIController not available for preview');
        }

        // 화면 공유 상태 업데이트
        if (channelId && currentUser?.id) {
            this.serverManager.updateParticipantScreenShare(channelId, currentUser.id, true);
        }

        // 트랙 종료 시 자동 정리
        screenStream.getVideoTracks().forEach(track => {
            track.onended = () => {
                console.log('[ScreenShare] Screen share track ended');
                this.stop();
            };
        });

        // 🔥 핵심: 수신자가 peer connection을 준비할 시간을 주기 위해 약간의 지연 후 트랙 추가
        console.log('[ScreenShare] ⏳ Waiting 500ms for receivers to prepare peer connections...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 모든 피어에 화면 공유 스트림 추가 (offer 전송)
        await this.addScreenShareToPeers();

        console.log('[ScreenShare] ✅ Screen share started successfully');
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

        // 모든 피어에서 화면 공유 트랙만 제거 (카메라는 유지)
        const peers = this.peerConnectionManager.getAll();
        Object.keys(peers).forEach(sid => {
            const pc = peers[sid];
            if (pc && pc.senders) {
                const screenTrack = this.mediaStreamManager.getScreenStream()?.getVideoTracks()[0];
                pc.getSenders().forEach(sender => {
                    // 화면 공유 트랙만 제거 (카메라 트랙은 유지)
                    if (sender.track && sender.track.id === screenTrack?.id) {
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

        // 🔥 핵심: peer connection이 없으면 생성해야 함
        if (peerEntries.length === 0) {
            console.log('[ScreenShare] ⚠️ No peer connections found, creating connections to participants...');
            // 통화 참가자 목록에서 peer connection 생성
            const channelId = this.serverManager.currentChannel?.id;
            if (channelId && this.app && this.app.webRTCManager) {
                // 🔥 수정: voiceParticipantsCache 사용 (voiceParticipants가 아님)
                const participants = this.serverManager.voiceParticipantsCache?.[channelId] || [];
                console.log('[ScreenShare] Found', participants.length, 'participants in cache:', JSON.stringify(participants));

                // 자신을 제외한 참가자들에게 peer connection 생성
                const currentUser = this.app.auth?.currentUser;
                const otherParticipants = participants.filter(p => p.id !== currentUser?.id && p.sid);

                if (otherParticipants.length > 0) {
                    console.log('[ScreenShare] Creating peer connections for', otherParticipants.length, 'participants');
                    for (const participant of otherParticipants) {
                        if (!this.peerConnectionManager.exists(participant.sid)) {
                            console.log('[ScreenShare] Creating peer connection to:', participant.sid);
                            await this.app.webRTCManager.createPeerConnection(participant.sid, true);
                        }
                    }
                    // peer 목록 다시 가져오기
                    const updatedPeers = this.peerConnectionManager.getAll();
                    const updatedEntries = Object.entries(updatedPeers);
                    console.log('[ScreenShare] Now have', updatedEntries.length, 'peer connections');

                    // 업데이트된 peer 목록으로 계속 진행
                    peerEntries.length = 0;
                    peerEntries.push(...updatedEntries);
                }
            }
        }

        // 모든 피어에 동시에 처리 (Discord처럼 즉시)
        await Promise.all(peerEntries.map(async ([sid, pc]) => {
            if (!pc || pc.signalingState === 'closed') {
                console.log('[ScreenShare] Skipping closed peer:', sid);
                return;
            }

            try {
                const senders = pc.getSenders();
                // 화면 공유 트랙이 이미 추가되어 있는지 확인
                const existingScreenSender = senders.find(s =>
                    s.track && s.track.kind === 'video' && s.track.id === videoTrack.id
                );

                if (!existingScreenSender) {
                    // 화면 공유 트랙을 별도 트랙으로 추가 (카메라와 함께)
                    console.log('[ScreenShare] Adding screen share track as separate track for:', sid);
                    pc.addTrack(videoTrack, screenStream);
                    console.log('[ScreenShare] ✅ Screen share track added (camera remains active)');

                    // 재협상: stable 상태일 때만
                    if (pc.signalingState === 'stable') {
                        try {
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            const channelId = this.serverManager.currentChannel?.id;
                            this.socketManager.emit('webrtc_offer', {
                                targetSid: sid,
                                offer: offer,
                                channelId: channelId
                            });
                            console.log('[ScreenShare] ✅ Renegotiation offer sent');
                        } catch (err) {
                            console.error('[ScreenShare] Error renegotiating:', err);
                        }
                    }
                } else {
                    console.log('[ScreenShare] Screen share track already exists for:', sid);
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

                // 🔍 Source ID 확인 로그 (소스 선택 시점)
                console.log('[ScreenShare] 📋 Source 선택됨:');
                console.log('  - 선택된 sourceId:', sourceId);
                console.log('  - sourceId type:', typeof sourceId);
                console.log('  - sourceId length:', sourceId?.length);

                if (!sourceId || typeof sourceId !== 'string' || sourceId.trim() === '') {
                    console.error('[ScreenShare] ❌ Invalid sourceId from picker:', sourceId);
                    if (this.app?.uiManager?.showToast) {
                        this.app.uiManager.showToast('유효하지 않은 화면 소스입니다.', 'error');
                    }
                    modal.remove();
                    return;
                }

                modal.remove();
                await this.startWithSource(sourceId);
            };
        });
    }
}


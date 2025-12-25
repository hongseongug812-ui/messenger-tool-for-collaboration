/**
 * WebRTCUIController - Single Responsibility: WebRTC 관련 UI 업데이트
 * SRP: UI 렌더링 및 업데이트만 담당
 */
export class WebRTCUIController {
    constructor(app) {
        this.app = app;
    }

    /**
     * 통화 컨트롤 바 표시
     */
    showCallControlBar() {
        const controlBar = document.getElementById('call-control-bar');
        if (controlBar) {
            controlBar.style.display = 'flex';
            this.startCallTimer();
        }
    }

    /**
     * 통화 컨트롤 바 숨기기
     */
    hideCallControlBar() {
        const controlBar = document.getElementById('call-control-bar');
        if (controlBar) {
            controlBar.style.display = 'none';
        }
    }

    /**
     * 통화 타이머 시작
     */
    startCallTimer() {
        const timerEl = document.getElementById('call-timer');
        if (!timerEl) return;

        let startTime = Date.now();
        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };

        this.callTimerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    }

    /**
     * 통화 타이머 중지
     */
    stopCallTimer() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
    }

    /**
     * 화면 공유 미리보기 표시
     * @param {MediaStream} stream - 화면 공유 스트림
     */
    showScreenSharePreview(stream) {
        const modal = document.getElementById('screen-share-modal');
        if (modal) modal.style.display = 'none';

        let container = document.getElementById('screen-share-container');
        if (container) container.remove();

        container = document.createElement('div');
        container.id = 'screen-share-container';
        container.className = 'screen-share-container';

        const userName = this.app.auth?.currentUser?.name || '나';
        container.innerHTML = `
            <div class="screen-share-header">
                <span class="screen-share-username">${userName}님이 화면을 공유 중입니다</span>
                <div class="screen-share-controls">
                    <button class="share-control-btn" id="btn-minimize-share" title="축소">─</button>
                    <button class="share-control-btn" id="btn-fullscreen-share" title="전체 화면">⛶</button>
                    <button class="share-control-btn danger" id="btn-end-share" title="공유 중지">✕</button>
                </div>
            </div>
            <div class="screen-share-video-wrapper">
                <video id="shared-screen-video" autoplay muted></video>
            </div>
        `;

        const chatArea = document.querySelector('.chat-content') || document.body;
        chatArea.prepend(container);

        const video = document.getElementById('shared-screen-video');
        if (video && stream) {
            video.srcObject = stream;
            video.play().catch(e => {
                if (e.name !== 'AbortError') {
                    console.error('[WebRTC] Video play error:', e);
                }
            });
        }
    }

    /**
     * 화면 공유 미리보기 숨기기
     */
    hideScreenSharePreview() {
        const container = document.getElementById('screen-share-container');
        const video = document.getElementById('shared-screen-video');

        if (container) {
            container.style.display = 'none';
            container.classList.remove('fullscreen');
        }

        if (video) {
            video.srcObject = null;
        }
    }

    /**
     * 원격 화면 공유 표시
     * @param {string} userId - 사용자 ID
     * @param {MediaStream} stream - 비디오 스트림
     */
    showRemoteScreenShare(userId, stream) {
        const userName = this.findUserNameByUserId(userId) || '사용자';

        let container = document.getElementById('remote-screen-share-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'remote-screen-share-container';
            container.className = 'screen-share-container';
            container.style.display = 'block';

            const chatArea = document.querySelector('.chat-content') || document.body;
            chatArea.prepend(container);
        }

        container.innerHTML = `
            <div class="screen-share-header">
                <span class="screen-share-username">${userName}님이 화면을 공유 중입니다</span>
                <button class="screen-share-close-btn" id="btn-close-remote-share">✕</button>
            </div>
            <div class="screen-share-video-wrapper">
                <video id="remote-screen-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
            </div>
        `;

        const video = document.getElementById('remote-screen-video');
        if (video && stream) {
            // 🔥 비디오 트랙이 enabled 상태인지 확인
            const videoTracks = stream.getVideoTracks();
            console.log('[WebRTCUI] Video tracks:', videoTracks.map(t => ({
                id: t.id,
                label: t.label,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
            })));

            // 트랙 활성화
            videoTracks.forEach(track => {
                if (!track.enabled) {
                    track.enabled = true;
                    console.log('[WebRTCUI] Enabled video track:', track.id);
                }
            });

            video.srcObject = stream;

            // 🔥 메타데이터 로드 후 재생 시도
            video.onloadedmetadata = () => {
                console.log('[WebRTCUI] Video metadata loaded, attempting play...');
                video.play().catch(e => {
                    console.warn('[WebRTCUI] Play after metadata failed:', e.name);
                });
            };

            // 즉시 재생 시도
            video.play().catch(e => {
                if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
                    console.error('[WebRTCUI] Video play error:', e);
                    // 1초 후 재시도
                    setTimeout(() => {
                        video.play().catch(e2 => {
                            console.error('[WebRTCUI] Retry play failed:', e2);
                        });
                    }, 1000);
                }
            });

            console.log('[WebRTCUI] ✅ Remote screen share video set up');
        } else {
            console.error('[WebRTCUI] ❌ Video element or stream not found:', { video: !!video, stream: !!stream });
        }

        // 닫기 버튼 이벤트
        document.getElementById('btn-close-remote-share')?.addEventListener('click', () => {
            container.remove();
        });
    }

    /**
     * 사용자 ID로 이름 찾기
     * @param {string} userId - 사용자 ID
     * @returns {string|null}
     */
    findUserNameByUserId(userId) {
        const channelId = this.app.serverManager.currentChannel?.id;
        if (!channelId) return null;

        const participants = this.app.serverManager.voiceParticipants?.[channelId] || [];
        const participant = participants.find(p => p.id === userId);
        return participant?.name || null;
    }
}


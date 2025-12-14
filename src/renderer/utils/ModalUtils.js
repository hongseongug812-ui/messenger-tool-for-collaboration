/**
 * ModalUtils - 모달 생성 유틸리티
 * DRY: 중복 모달 생성 코드 제거
 */
export const ModalUtils = {
    /**
     * 모달 오버레이 생성
     * @param {object} options - { id, className, content, onClose }
     * @returns {HTMLElement} 생성된 모달 엘리먼트
     */
    createOverlay(options) {
        const existingModal = document.getElementById(options.id);
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.id = options.id;
        overlay.className = options.className || 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = options.content;

        document.body.appendChild(overlay);

        // 외부 클릭 시 닫기
        overlay.addEventListener('click', (e) => {
            if (e.target !== overlay) return;
            options.onClose?.();
            overlay.remove();
        });

        return overlay;
    },

    /**
     * 모달 제거
     * @param {string} id - 모달 ID
     */
    remove(id) {
        document.getElementById(id)?.remove();
    },

    /**
     * 스타일이 없으면 동적으로 추가
     * @param {string} styleId - 스타일 태그 ID
     * @param {string} css - CSS 문자열
     */
    injectStyles(styleId, css) {
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }
};

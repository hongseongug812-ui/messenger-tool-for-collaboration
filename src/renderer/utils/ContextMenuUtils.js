/**
 * ContextMenuUtils - 컨텍스트 메뉴 유틸리티
 * DRY: 중복 메뉴 생성 코드 제거
 */
export const ContextMenuUtils = {
    /**
     * 컨텍스트 메뉴 표시
     * @param {HTMLElement} menu - 메뉴 엘리먼트
     * @param {MouseEvent} event - 클릭 이벤트
     */
    show(menu, event) {
        if (!menu) return;

        menu.style.display = 'block';

        // 화면 경계를 넘지 않도록 위치 조정
        const menuWidth = menu.offsetWidth || 150;
        const menuHeight = menu.offsetHeight || 200;
        const x = Math.min(event.clientX, window.innerWidth - menuWidth - 10);
        const y = Math.min(event.clientY, window.innerHeight - menuHeight - 10);

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        // 외부 클릭 시 자동 닫기 (Early Return 패턴)
        const closeHandler = (e) => {
            if (menu.contains(e.target)) return;
            menu.style.display = 'none';
            document.removeEventListener('click', closeHandler);
        };

        // 현재 이벤트 루프 이후에 리스너 등록 (즉시 닫히는 것 방지)
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    },

    /**
     * 컨텍스트 메뉴 숨기기
     * @param {HTMLElement} menu - 메뉴 엘리먼트
     */
    hide(menu) {
        if (menu) menu.style.display = 'none';
    },

    /**
     * 모든 컨텍스트 메뉴 숨기기
     * @param {string[]} menuIds - 메뉴 ID 배열
     */
    hideAll(menuIds) {
        menuIds.forEach(id => {
            const menu = document.getElementById(id);
            if (menu) menu.style.display = 'none';
        });
    }
};

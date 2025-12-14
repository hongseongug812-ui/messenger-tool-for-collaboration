/**
 * 애플리케이션 상수
 * 매직 넘버 및 하드코딩 값 중앙화
 * 유지보수성 향상을 위해 변경 가능한 값들을 한 곳에서 관리
 */

export const CONFIG = {
    API: {
        BASE_URL: 'http://localhost:8000',
        TIMEOUT_MS: 5000,
    },

    SOCKET: {
        RECONNECT_DELAY_MS: 3000,  // 소켓 연결 끊김 시 재연결까지 대기 시간
        TYPING_TIMEOUT_MS: 3000,   // 타이핑 표시기 지속 시간
    },

    UI: {
        TOAST_DURATION_MS: 3000,
        MODAL_ANIMATION_MS: 200,
        CONTEXT_MENU_OFFSET: 10,   // 화면 경계에서의 여백
    },

    WEBRTC: {
        ICE_SERVERS: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ],
        OFFER_TIMEOUT_MS: 30000,  // Offer 응답 대기 시간
        STREAM_WAIT_TIMEOUT_MS: 5000,
    },

    SCREEN_SHARE: {
        DEFAULT_WIDTH: 1920,
        DEFAULT_HEIGHT: 1080,
        FRAME_RATE: 30,
    }
};

// 자주 사용되는 이모지 리스트 (반응 선택기용)
export const EMOJI_QUICK_LIST = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

// 슬래시 명령어 정의
export const SLASH_COMMANDS = [
    { name: '/help', description: '명령어 도움말 표시', usage: '/help' },
    { name: '/remind', description: '리마인더 설정', usage: '/remind me 10m "메시지"' },
    { name: '/clear', description: '메시지 화면 지우기', usage: '/clear' },
    { name: '/shrug', description: '어깨 으쓱 이모티콘', usage: '/shrug' },
    { name: '/tableflip', description: '테이블 뒤집기 이모티콘', usage: '/tableflip' },
    { name: '/unflip', description: '테이블 되돌리기', usage: '/unflip' },
    { name: '/disapprove', description: '불만족 표정', usage: '/disapprove' },
    { name: '/lenny', description: '레니 페이스', usage: '/lenny' },
    { name: '/away', description: '자리 비움 상태 설정', usage: '/away [메시지]' },
    { name: '/back', description: '자리 비움 해제', usage: '/back' },
    { name: '/status', description: '상태 메시지 설정', usage: '/status 상태메시지' },
    { name: '/giphy', description: 'GIF 검색 (준비중)', usage: '/giphy 검색어' }
];

// 이모티콘 단축키 매핑
export const EMOJI_SHORTCUTS = {
    '/shrug': '¯\\_(ツ)_/¯',
    '/tableflip': '(╯°□°)╯︵ ┻━┻',
    '/unflip': '┬─┬ ノ( ゜-゜ノ)',
    '/disapprove': 'ಠ_ಠ',
    '/lenny': '( ͡° ͜ʖ ͡°)',
};

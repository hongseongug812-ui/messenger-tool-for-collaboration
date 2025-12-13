/**
 * ChannelPolicy - Domain Layer
 * SRP: 채널 접근 및 게시 권한 체크만 담당
 * OCP: 새로운 채널 타입 추가 가능
 */
export class ChannelPolicy {
    /**
     * 채널 접근 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {string} userId - 사용자 ID
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static canAccess(channel, userId, userRole) {
        if (!channel) return false;

        // 공개 채널은 모든 멤버 접근 가능
        if (!channel.is_private) {
            return true;
        }

        // 허용된 멤버 목록 확인
        if (channel.allowed_members && channel.allowed_members.includes(userId)) {
            return true;
        }

        // 허용된 역할 확인
        if (channel.allowed_roles && channel.allowed_roles.includes(userRole)) {
            return true;
        }

        // 소유자와 관리자는 모든 채널 접근 가능
        if (userRole === 'owner' || userRole === 'admin') {
            return true;
        }

        return false;
    }

    /**
     * 채널에 메시지 게시 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static canPost(channel, userRole) {
        if (!channel) return false;

        const postPermission = channel.post_permission || 'everyone';

        switch (postPermission) {
            case 'everyone':
                return true;
            case 'admin_only':
                return userRole === 'owner' || userRole === 'admin';
            case 'owner_only':
                return userRole === 'owner';
            default:
                return true; // 기본값: 허용
        }
    }

    /**
     * 채널 수정 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static canModify(channel, userRole) {
        if (!channel) return false;
        return userRole === 'owner' || userRole === 'admin';
    }

    /**
     * 채널 삭제 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static canDelete(channel, userRole) {
        if (!channel) return false;
        return userRole === 'owner' || userRole === 'admin';
    }
}


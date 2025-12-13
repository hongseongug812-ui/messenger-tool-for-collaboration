/**
 * ServerPolicy - Domain Layer
 * SRP: 서버 관련 권한 체크만 담당
 */
export class ServerPolicy {
    /**
     * 서버 멤버인지 확인
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static isMember(server, userId) {
        if (!server || !userId) return false;
        const members = server.members || [];
        return members.some(m => m.id === userId);
    }

    /**
     * 서버에서 사용자 역할 가져오기
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {string|null} 역할 (owner, admin, member) 또는 null
     */
    static getUserRole(server, userId) {
        if (!server || !userId) return null;
        const members = server.members || [];
        const member = members.find(m => m.id === userId);
        return member?.role || null;
    }

    /**
     * 서버 수정 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static canModify(server, userId) {
        const role = this.getUserRole(server, userId);
        return role === 'owner' || role === 'admin';
    }

    /**
     * 서버 삭제 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static canDelete(server, userId) {
        const role = this.getUserRole(server, userId);
        return role === 'owner';
    }

    /**
     * 멤버 관리 권한 체크 (추가/제거/역할 변경)
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static canManageMembers(server, userId) {
        const role = this.getUserRole(server, userId);
        return role === 'owner' || role === 'admin';
    }

    /**
     * 카테고리 생성 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static canCreateCategory(server, userId) {
        const role = this.getUserRole(server, userId);
        return role === 'owner' || role === 'admin';
    }

    /**
     * 채널 생성 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    static canCreateChannel(server, userId) {
        const role = this.getUserRole(server, userId);
        return role === 'owner' || role === 'admin';
    }
}


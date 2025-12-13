/**
 * PermissionPolicy - Domain Layer
 * SRP: 권한 체크 로직만 담당
 * OCP: 새로운 권한 타입 추가 가능 (확장에 열림)
 * DIP: 추상화에 의존 (역할 기반)
 */
export class PermissionPolicy {
    /**
     * 역할 기반 권한 체크
     * @param {string} userRole - 사용자 역할 (owner, admin, member)
     * @param {Array<string>} requiredRoles - 필요한 역할 목록
     * @returns {boolean}
     */
    static hasRole(userRole, requiredRoles) {
        if (!userRole || !requiredRoles || requiredRoles.length === 0) {
            return false;
        }
        return requiredRoles.includes(userRole);
    }

    /**
     * 관리자 권한 체크
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static isAdmin(userRole) {
        return this.hasRole(userRole, ['owner', 'admin']);
    }

    /**
     * 소유자 권한 체크
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static isOwner(userRole) {
        return userRole === 'owner';
    }

    /**
     * 멤버 권한 체크 (기본 권한)
     * @param {string} userRole - 사용자 역할
     * @returns {boolean}
     */
    static isMember(userRole) {
        return ['owner', 'admin', 'member'].includes(userRole);
    }

    /**
     * 권한 비교 (권한 레벨)
     * @param {string} userRole - 사용자 역할
     * @param {string} targetRole - 비교 대상 역할
     * @returns {number} -1: 낮음, 0: 같음, 1: 높음
     */
    static compareRole(userRole, targetRole) {
        const roleLevels = {
            'owner': 3,
            'admin': 2,
            'member': 1
        };

        const userLevel = roleLevels[userRole] || 0;
        const targetLevel = roleLevels[targetRole] || 0;

        if (userLevel > targetLevel) return 1;
        if (userLevel < targetLevel) return -1;
        return 0;
    }
}


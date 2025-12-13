/**
 * PermissionService - Application Layer
 * SRP: 권한 체크 서비스 (Domain Policy를 사용)
 * DIP: Domain Layer의 Policy에 의존
 */
import { PermissionPolicy, ChannelPolicy, ServerPolicy } from '../../domain/policy/index.js';

export class PermissionService {
    /**
     * 채널 접근 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    canAccessChannel(channel, server, userId) {
        if (!channel || !server || !userId) return false;
        
        const userRole = ServerPolicy.getUserRole(server, userId);
        if (!userRole) return false;

        return ChannelPolicy.canAccess(channel, userId, userRole);
    }

    /**
     * 채널에 메시지 게시 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    canPostInChannel(channel, server, userId) {
        if (!channel || !server || !userId) return false;
        
        const userRole = ServerPolicy.getUserRole(server, userId);
        if (!userRole) return false;

        return ChannelPolicy.canPost(channel, userRole);
    }

    /**
     * 채널 수정 권한 체크
     * @param {Object} channel - 채널 객체
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    canModifyChannel(channel, server, userId) {
        if (!channel || !server || !userId) return false;
        
        const userRole = ServerPolicy.getUserRole(server, userId);
        if (!userRole) return false;

        return ChannelPolicy.canModify(channel, userRole);
    }

    /**
     * 서버 수정 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    canModifyServer(server, userId) {
        if (!server || !userId) return false;
        return ServerPolicy.canModify(server, userId);
    }

    /**
     * 카테고리 생성 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    canCreateCategory(server, userId) {
        if (!server || !userId) return false;
        return ServerPolicy.canCreateCategory(server, userId);
    }

    /**
     * 채널 생성 권한 체크
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {boolean}
     */
    canCreateChannel(server, userId) {
        if (!server || !userId) return false;
        return ServerPolicy.canCreateChannel(server, userId);
    }

    /**
     * 사용자 역할 가져오기
     * @param {Object} server - 서버 객체
     * @param {string} userId - 사용자 ID
     * @returns {string|null}
     */
    getUserRole(server, userId) {
        if (!server || !userId) return null;
        return ServerPolicy.getUserRole(server, userId);
    }
}


export class AuthManager {
    constructor(app) {
        this.app = app;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.authToken = null;
    }

    async checkAuth() {
        // localStorage에서 토큰 확인 (로그인 상태 유지)
        const token = localStorage.getItem('work_messenger_token');
        if (token) {
            this.authToken = token;
            const user = await this.verifyToken(token);
            if (user) {
                this.isAuthenticated = true;
                this.currentUser = user;
                this.app.updateUserInfo(user);
                return true;
            }
            // 토큰이 유효하지 않으면 제거
            localStorage.removeItem('work_messenger_token');
        }

        // sessionStorage에서 토큰 확인 (현재 세션만)
        const tempToken = sessionStorage.getItem('work_messenger_token');
        if (tempToken) {
            this.authToken = tempToken;
            const user = await this.verifyToken(tempToken);
            if (user) {
                this.isAuthenticated = true;
                this.currentUser = user;
                this.app.updateUserInfo(user);
                return true;
            }
            // 토큰이 유효하지 않으면 제거
            sessionStorage.removeItem('work_messenger_token');
        }

        return false;
    }

    async verifyToken(token) {
        try {
            const response = await fetch(`${this.app.apiBase}/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('토큰 검증 실패:', error);
            return null;
        }
    }

    showAuthScreen() {
        const authScreen = document.getElementById('auth-screen');
        const appElement = document.getElementById('app');

        if (authScreen) {
            authScreen.style.display = 'flex';
            appElement.style.display = 'none';
            this.bindAuthEvents();
        }
    }

    hideAuthScreen() {
        const authScreen = document.getElementById('auth-screen');
        const appElement = document.getElementById('app');

        if (authScreen) {
            authScreen.style.display = 'none';
            appElement.style.display = 'flex';
        }
    }

    bindAuthEvents() {
        // 로그인 폼 제출
        const loginForm = document.getElementById('login-form-element');
        if (loginForm) {
            // Remove existing listeners to prevent duplicates (if any)
            const newLoginForm = loginForm.cloneNode(true);
            loginForm.parentNode.replaceChild(newLoginForm, loginForm);
            newLoginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // 회원가입 폼 제출
        const signupForm = document.getElementById('signup-form-element');
        if (signupForm) {
            const newSignupForm = signupForm.cloneNode(true);
            signupForm.parentNode.replaceChild(newSignupForm, signupForm);
            newSignupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }

        // 폼 전환 버튼
        const showSignupBtn = document.getElementById('show-signup');
        const showLoginBtn = document.getElementById('show-login');

        if (showSignupBtn) {
            showSignupBtn.onclick = () => this.switchToSignup();
        }

        if (showLoginBtn) {
            showLoginBtn.onclick = () => this.switchToLogin();
        }

        // 비밀번호 찾기 링크
        const forgotPasswordLink = document.getElementById('forgot-password-link');
        if (forgotPasswordLink) {
            forgotPasswordLink.onclick = (e) => {
                e.preventDefault();
                this.showForgotPasswordModal();
            };
        }

        // 비밀번호 찾기 모달
        const forgotPasswordForm = document.getElementById('forgot-password-form');
        if (forgotPasswordForm) {
            const newForgotPasswordForm = forgotPasswordForm.cloneNode(true);
            forgotPasswordForm.parentNode.replaceChild(newForgotPasswordForm, forgotPasswordForm);
            newForgotPasswordForm.addEventListener('submit', (e) => this.handleForgotPassword(e));
        }

        const closeForgotPassword = document.getElementById('close-forgot-password');
        const cancelForgotPassword = document.getElementById('cancel-forgot-password');
        if (closeForgotPassword) {
            closeForgotPassword.onclick = () => this.closeForgotPasswordModal();
        }
        if (cancelForgotPassword) {
            cancelForgotPassword.onclick = () => this.closeForgotPasswordModal();
        }

        // 비밀번호 재설정 모달
        const resetPasswordForm = document.getElementById('reset-password-form');
        if (resetPasswordForm) {
            const newResetPasswordForm = resetPasswordForm.cloneNode(true);
            resetPasswordForm.parentNode.replaceChild(newResetPasswordForm, resetPasswordForm);
            newResetPasswordForm.addEventListener('submit', (e) => this.handleResetPassword(e));
        }

        const closeResetPassword = document.getElementById('close-reset-password');
        const cancelResetPassword = document.getElementById('cancel-reset-password');
        if (closeResetPassword) {
            closeResetPassword.onclick = () => this.closeResetPasswordModal();
        }
        if (cancelResetPassword) {
            cancelResetPassword.onclick = () => this.closeResetPasswordModal();
        }

        // 2FA 설정 모달
        const twoFAVerifyForm = document.getElementById('2fa-verify-form');
        if (twoFAVerifyForm) {
            const newTwoFAVerifyForm = twoFAVerifyForm.cloneNode(true);
            twoFAVerifyForm.parentNode.replaceChild(newTwoFAVerifyForm, twoFAVerifyForm);
            newTwoFAVerifyForm.addEventListener('submit', (e) => this.handle2FAVerify(e));
        }

        const close2FASetup = document.getElementById('close-2fa-setup');
        const cancel2FASetup = document.getElementById('cancel-2fa-setup');
        if (close2FASetup) {
            close2FASetup.onclick = () => this.close2FASetupModal();
        }
        if (cancel2FASetup) {
            cancel2FASetup.onclick = () => this.close2FASetupModal();
        }

        // 2FA 설정 토글 (설정 메뉴)
        const settings2FAEnabled = document.getElementById('settings-2fa-enabled');
        if (settings2FAEnabled) {
            settings2FAEnabled.onchange = (e) => this.handle2FAToggle(e);
        }
    }

    switchToSignup() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
        this.clearAuthMessages();
    }

    switchToLogin() {
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        this.clearAuthMessages();
    }

    clearAuthMessages() {
        const errors = document.querySelectorAll('.auth-error, .auth-success');
        errors.forEach(el => el.remove());
    }

    showAuthError(formId, message) {
        this.clearAuthMessages();
        const form = document.getElementById(formId);
        if (!form) return;
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error';
        errorDiv.textContent = message;
        form.insertBefore(errorDiv, form.querySelector('form'));
    }

    showAuthSuccess(formId, message) {
        this.clearAuthMessages();
        const form = document.getElementById(formId);
        if (!form) return;
        const successDiv = document.createElement('div');
        successDiv.className = 'auth-success';
        successDiv.textContent = message;
        form.insertBefore(successDiv, form.querySelector('form'));
    }

    async handleLogin(e) {
        e.preventDefault();

        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('remember-me').checked;
        const totpCode = document.getElementById('login-2fa-code').value.trim();

        if (!username || !password) {
            this.showAuthError('login-form', '아이디와 비밀번호를 입력하세요.');
            return;
        }

        try {
            const requestBody = { username, password };
            if (totpCode) {
                requestBody.totp_code = totpCode;
            }

            const response = await fetch(`${this.app.apiBase}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.status === 403 && data.detail === '2FA code required') {
                document.getElementById('2fa-code-group').style.display = 'block';
                document.getElementById('login-2fa-code').focus();
                this.showAuthError('login-form', '2단계 인증 코드를 입력하세요.');
                return;
            }

            if (!response.ok) {
                this.showAuthError('login-form', data.detail || '로그인에 실패했습니다.');
                return;
            }

            this.authToken = data.access_token;
            this.isAuthenticated = true;
            this.currentUser = data.user;
            this.app.updateUserInfo(data.user);

            if (rememberMe) {
                localStorage.setItem('work_messenger_token', data.access_token);
            } else {
                sessionStorage.setItem('work_messenger_token', data.access_token);
            }

            this.hideAuthScreen();
            await this.app.initializeApp();
        } catch (error) {
            console.error('로그인 오류:', error);
            this.showAuthError('login-form', '서버 연결에 실패했습니다. 백엔드 서버가 실행 중인지 확인하세요.');
        }
    }

    async handleSignup(e) {
        e.preventDefault();

        const username = document.getElementById('signup-username').value.trim();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const passwordConfirm = document.getElementById('signup-password-confirm').value;

        if (!username || !name || !email || !password) {
            this.showAuthError('signup-form', '모든 필드를 입력하세요.');
            return;
        }

        if (username.length < 3) {
            this.showAuthError('signup-form', '아이디는 3자 이상이어야 합니다.');
            return;
        }

        if (password.length < 6) {
            this.showAuthError('signup-form', '비밀번호는 6자 이상이어야 합니다.');
            return;
        }

        if (password !== passwordConfirm) {
            this.showAuthError('signup-form', '비밀번호가 일치하지 않습니다.');
            return;
        }

        try {
            const response = await fetch(`${this.app.apiBase}/auth/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, name, email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                let errorMessage = '회원가입에 실패했습니다.';
                if (data.detail) {
                    if (data.detail.includes('Username')) {
                        errorMessage = '이미 존재하는 아이디입니다.';
                    } else if (data.detail.includes('Email')) {
                        errorMessage = '이미 존재하는 이메일입니다.';
                    } else {
                        errorMessage = data.detail;
                    }
                }
                this.showAuthError('signup-form', errorMessage);
                return;
            }

            this.showAuthSuccess('signup-form', '회원가입이 완료되었습니다. 로그인해주세요.');
            document.getElementById('signup-form-element').reset();

            setTimeout(() => {
                this.switchToLogin();
            }, 2000);
        } catch (error) {
            console.error('회원가입 오류:', error);
            this.showAuthError('signup-form', '서버 연결에 실패했습니다. 백엔드 서버가 실행 중인지 확인하세요.');
        }
    }

    showForgotPasswordModal() {
        const modal = document.getElementById('forgot-password-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('forgot-email').focus();
            document.getElementById('forgot-password-success').style.display = 'none';
            document.getElementById('forgot-password-form').style.display = 'block';
            document.getElementById('forgot-password-form').reset();
        }
    }

    closeForgotPasswordModal() {
        const modal = document.getElementById('forgot-password-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim();

        if (!email) {
            alert('이메일을 입력하세요.');
            return;
        }

        try {
            const response = await fetch(`${this.app.apiBase}/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok) {
                document.getElementById('forgot-password-form').style.display = 'none';
                document.getElementById('forgot-password-success').style.display = 'block';
            } else {
                alert(data.detail || '비밀번호 재설정 요청에 실패했습니다.');
            }
        } catch (error) {
            console.error('비밀번호 찾기 오류:', error);
            alert('서버 연결에 실패했습니다.');
        }
    }

    closeResetPasswordModal() {
        const modal = document.getElementById('reset-password-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async handleResetPassword(e) {
        e.preventDefault();

        const token = document.getElementById('reset-token').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!newPassword || !confirmPassword) {
            alert('모든 필드를 입력하세요.');
            return;
        }

        if (newPassword.length < 6) {
            alert('비밀번호는 6자 이상이어야 합니다.');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        try {
            const response = await fetch(`${this.app.apiBase}/auth/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token,
                    new_password: newPassword
                })
            });

            const data = await response.json();
            if (response.ok) {
                alert('비밀번호가 성공적으로 변경되었습니다. 로그인해주세요.');
                this.closeResetPasswordModal();
            } else {
                alert(data.detail || '비밀번호 재설정에 실패했습니다.');
            }
        } catch (error) {
            console.error('비밀번호 재설정 오류:', error);
            alert('서버 연결에 실패했습니다.');
        }
        // ... (previous methods)
    }

    async show2FASetupModal() {
        const modal = document.getElementById('2fa-setup-modal');
        if (!modal) return;

        try {
            const response = await fetch(`${this.app.apiBase}/auth/2fa/setup`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.detail || '2FA 설정 정보를 가져오는데 실패했습니다.');
                document.getElementById('settings-2fa-enabled').checked = false;
                return;
            }

            const data = await response.json();
            // data.otpauth_url or secret might be used.
            // Assuming backend provides QR code image specifically or we use secret?
            // If backend provides a base64 image or a URL to generate QR, we use it. 
            // If the original app used a library, we might need to know. 
            // Attempt to use a public API or if data contains `qr_code` (base64).

            const qrImg = document.getElementById('2fa-qr-code');
            const secretInput = document.getElementById('2fa-secret');

            if (data.qr_code_url) {
                qrImg.src = data.qr_code_url;
            } else if (data.secret) {
                // Fallback if no QR URL: Use a free QR generator API with otpauth url
                // Or maybe the backend returned the base64 image in 'qr_code' field?
                // Let's assume standard field names. 
                // If data.otpauth_url exists:
                if (data.otpauth_url) {
                    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.otpauth_url)}`;
                }
            }

            if (data.secret) {
                secretInput.value = data.secret;
            }

            modal.style.display = 'flex';
            document.getElementById('2fa-verify-code').focus();

        } catch (error) {
            console.error('2FA Setup Error:', error);
            alert('서버 연결에 실패했습니다.');
            document.getElementById('settings-2fa-enabled').checked = false;
        }
    }

    close2FASetupModal() {
        const modal = document.getElementById('2fa-setup-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        // If not verified, uncheck the toggle?
        // We might need to check if it was actually enabled.
        // For simplicity, we assume if closed without verify, it cancels.
        // But the toggle might remain checked if we don't reset it.
        // We can handle that if we track state, but for now leave it.
    }

    async handle2FAVerify(e) {
        e.preventDefault();
        const code = document.getElementById('2fa-verify-code').value.trim();
        if (!code) {
            alert('인증 코드를 입력하세요.');
            return;
        }

        try {
            const response = await fetch(`${this.app.apiBase}/auth/2fa/enable`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });

            if (response.ok) {
                alert('2단계 인증이 활성화되었습니다.');
                this.close2FASetupModal();
                if (this.currentUser) {
                    this.currentUser.totp_enabled = true;
                }
            } else {
                const data = await response.json();
                alert(data.detail || '인증 코드가 올바르지 않습니다.');
            }
        } catch (error) {
            console.error('2FA Verify Error:', error);
            alert('서버 연결 오류');
        }
    }

    async handle2FAToggle(e) {
        const isEnabled = e.target.checked;

        if (isEnabled) {
            await this.show2FASetupModal();
        } else {
            if (!confirm('2단계 인증을 비활성화하시겠습니까?')) {
                e.target.checked = true;
                return;
            }

            try {
                const response = await fetch(`${this.app.apiBase}/auth/2fa/disable`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    alert('2단계 인증이 비활성화되었습니다.');
                    if (this.currentUser) {
                        this.currentUser.totp_enabled = false;
                    }
                } else {
                    const data = await response.json();
                    alert(data.detail || '2FA 비활성화 실패');
                    e.target.checked = true;
                }
            } catch (error) {
                console.error('2FA Disable Error:', error);
                alert('서버 연결 오류');
                e.target.checked = true;
            }
        }
    }


    logout() {
        if (this.app.apiBase && this.authToken) {
            fetch(`${this.app.apiBase}/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            }).catch(() => { });
        }

        localStorage.removeItem('work_messenger_token');
        sessionStorage.removeItem('work_messenger_token');

        this.isAuthenticated = false;
        this.currentUser = null;
        this.authToken = null;

        this.showAuthScreen();
        // Socket disconnect if needed
        if (this.app.socketManager) {
            this.app.socketManager.disconnect();
        }

        console.log('로그아웃 완료');
    }
}

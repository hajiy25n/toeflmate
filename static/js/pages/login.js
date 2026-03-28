import API from "../lib/api.js";
import Store from "../lib/store.js";

export default function LoginPage(app) {
    let mode = "login";

    function render() {
        app.innerHTML = `
            <div class="login-container">
                <div class="login-card card">
                    <div class="login-logo">
                        <h1>토플메이트</h1>
                        <p>TOEFL 2026 Practice</p>
                    </div>
                    <div class="login-tabs">
                        <button class="login-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">로그인</button>
                        <button class="login-tab ${mode === 'register' ? 'active' : ''}" data-mode="register">회원가입</button>
                    </div>
                    <form id="auth-form">
                        <div class="form-group">
                            <label>아이디</label>
                            <input class="form-input" id="username" type="text" placeholder="닉네임 입력" autocomplete="username" required>
                        </div>
                        <div class="form-group">
                            <label>비밀번호</label>
                            <input class="form-input" id="password" type="password" placeholder="비밀번호 입력" autocomplete="current-password" required>
                        </div>
                        <div id="auth-error" class="form-error hidden"></div>
                        <button class="btn btn-primary btn-block mt-16" type="submit">
                            ${mode === 'login' ? '로그인' : '회원가입'}
                        </button>
                    </form>
                </div>
            </div>
        `;

        app.querySelectorAll(".login-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                mode = tab.dataset.mode;
                render();
            });
        });

        const form = document.getElementById("auth-form");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            const errEl = document.getElementById("auth-error");
            errEl.classList.add("hidden");

            try {
                const endpoint = mode === "login" ? "/api/login" : "/api/register";
                const result = await API.post(endpoint, { username, password });
                Store.setUser({ user_id: result.user_id, username: result.username });
                location.hash = "#/";
            } catch (err) {
                errEl.textContent = err.error || "오류가 발생했습니다.";
                errEl.classList.remove("hidden");
            }
        });
    }

    render();
}

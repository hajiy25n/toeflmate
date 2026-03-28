import Store from "../lib/store.js";
import API from "../lib/api.js";

export function renderHeader(title, showBack = true) {
    return `
        <div class="header">
            <div class="flex items-center gap-8">
                ${showBack ? `<button class="back-btn" onclick="location.hash='#/'">&larr;</button>` : ""}
                <span class="header-title">${title || "토플메이트"}</span>
            </div>
            <div class="header-actions">
                <div class="settings-wrap" id="settings-wrap">
                    <button class="settings-btn" id="settings-btn" title="설정">⚙️</button>
                    <div class="settings-dropdown hidden" id="settings-dropdown">
                        <div class="settings-dropdown-arrow"></div>
                        <div id="settings-profile" class="settings-profile"></div>
                        <div class="settings-divider"></div>
                        <button class="settings-item" id="logout-btn">로그아웃</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function bindLogout() {
    const btn = document.getElementById("settings-btn");
    const dropdown = document.getElementById("settings-dropdown");
    const profileEl = document.getElementById("settings-profile");

    if (!btn || !dropdown) return;

    // Load profile info
    API.get("/api/profile").then(p => {
        if (profileEl) {
            const date = p.created_at ? new Date(p.created_at).toLocaleDateString("ko-KR") : "-";
            profileEl.innerHTML = `
                <div class="settings-info"><span class="settings-label">아이디</span><span>${p.username}</span></div>
                <div class="settings-info"><span class="settings-label">가입일</span><span>${date}</span></div>
            `;
        }
    }).catch(() => {
        if (profileEl) {
            const user = Store.user;
            profileEl.innerHTML = `<div class="settings-info"><span>${user?.username || ""}</span></div>`;
        }
    });

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("hidden");
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target) && e.target !== btn) {
            dropdown.classList.add("hidden");
        }
    });

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await API.post("/api/logout");
            Store.clearUser();
            location.hash = "#/login";
        });
    }
}

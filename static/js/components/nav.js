import Store from "../lib/store.js";
import API from "../lib/api.js";

export function renderHeader(title, showBack = true) {
    const user = Store.user;
    return `
        <div class="header">
            <div class="flex items-center gap-8">
                ${showBack ? `<button class="back-btn" onclick="location.hash='#/'">&larr;</button>` : ""}
                <span class="header-title">${title || "토플메이트"}</span>
            </div>
            <div class="header-actions">
                ${user ? `
                    <span class="header-user">${user.username}</span>
                    <button class="btn btn-sm btn-secondary" id="logout-btn">로그아웃</button>
                ` : ""}
            </div>
        </div>
    `;
}

export function bindLogout() {
    const btn = document.getElementById("logout-btn");
    if (btn) {
        btn.addEventListener("click", async () => {
            await API.post("/api/logout");
            Store.clearUser();
            location.hash = "#/login";
        });
    }
}

import API from "../lib/api.js";
import { renderHeader, bindLogout } from "../components/nav.js";

export default async function HomePage(app) {
    let counts = { speaking_interview: 0, writing_email: 0, writing_discussion: 0 };
    try {
        const qs = await API.get("/api/questions");
        for (const q of qs) counts[q.type] = (counts[q.type] || 0) + 1;
    } catch {}

    app.innerHTML = `
        ${renderHeader("토플메이트", false)}
        <div class="home-grid">
            <div class="home-card" data-href="#/speaking">
                <div class="home-card-icon">🎙️</div>
                <div class="home-card-title">Speaking Interview</div>
                <div class="home-card-desc">인터뷰 질문에 45초 안에 답변하는 연습</div>
                <span class="home-card-count">${counts.speaking_interview}문제</span>
            </div>
            <div class="home-card" data-href="#/writing-email">
                <div class="home-card-icon">✉️</div>
                <div class="home-card-title">Writing Email</div>
                <div class="home-card-desc">이메일 작성 연습</div>
                <span class="home-card-count">${counts.writing_email}문제</span>
            </div>
            <div class="home-card" data-href="#/writing-discussion">
                <div class="home-card-icon">💬</div>
                <div class="home-card-title">Writing Discussion</div>
                <div class="home-card-desc">토론 글 작성 연습</div>
                <span class="home-card-count">${counts.writing_discussion}문제</span>
            </div>
            <div class="home-card" data-href="#/import">
                <div class="home-card-icon">📥</div>
                <div class="home-card-title">문제 관리</div>
                <div class="home-card-desc">Excel, Word 파일로 문제 업로드 및 관리</div>
            </div>
        </div>
    `;

    bindLogout();

    app.querySelectorAll(".home-card[data-href]").forEach(card => {
        card.addEventListener("click", () => {
            location.hash = card.dataset.href;
        });
    });
}

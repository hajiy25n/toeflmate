import API from "../lib/api.js";
import { renderHeader, bindLogout } from "../components/nav.js";

function readVocabProgress() {
    try {
        const raw = localStorage.getItem("vocab_progress_v1");
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

export default async function HomePage(app) {
    let counts = { speaking_interview: 0, writing_email: 0, writing_discussion: 0 };
    try {
        const qs = await API.get("/api/questions");
        for (const q of qs) counts[q.type] = (counts[q.type] || 0) + 1;
    } catch {}

    // Vocab summary (uses cached vocab list + localStorage progress)
    let vocabTotal = 0;
    try {
        const cached = sessionStorage.getItem("toeflmate_vocab_cache");
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) vocabTotal = parsed.length;
        }
        if (!vocabTotal) {
            const words = await API.get("/api/vocab");
            vocabTotal = words.length;
            sessionStorage.setItem("toeflmate_vocab_cache", JSON.stringify(words));
        }
    } catch {}

    const progress = readVocabProgress();
    let knownCount = 0;
    let unknownCount = 0;
    for (const k in progress) {
        if (progress[k]?.status === "known") knownCount++;
        else if (progress[k]?.status === "unknown") unknownCount++;
    }
    const unseenCount = Math.max(0, vocabTotal - knownCount - unknownCount);
    const progressPct = vocabTotal ? Math.round((knownCount / vocabTotal) * 100) : 0;

    app.innerHTML = `
        ${renderHeader("토플메이트", false)}
        <div class="home-grid">
            <div class="home-card vocab-home-card" data-href="#/vocab">
                <div class="home-card-icon">📚</div>
                <div class="home-card-title">Vocabulary</div>
                <div class="home-card-desc">TOEFL 핵심 단어 ${vocabTotal || 97}개 플래시카드 암기</div>
                <div class="vocab-home-badges">
                    <span class="vocab-home-badge known">✓ 아는단어 ${knownCount}</span>
                    <span class="home-card-count">○ 미학습 ${unseenCount}</span>
                </div>
                <div class="vocab-home-bar">
                    <div class="vocab-home-bar-fill" style="width:${progressPct}%"></div>
                </div>
                <div class="vocab-home-pct">${progressPct}%</div>
            </div>
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

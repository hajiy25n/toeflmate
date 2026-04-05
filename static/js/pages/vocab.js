import API from "../lib/api.js";
import { renderHeader, bindLogout } from "../components/nav.js";
import {
    loadProgress,
    clearProgress,
    loadLastIndex,
    clearLastIndex,
    statusOf,
    posClass,
    escapeHtml,
    showToast,
    clearSwipeHintSeen,
} from "../lib/vocab-utils.js";

export default async function VocabPage(app) {
    let words = [];
    let progress = loadProgress();
    let filter = "all"; // all | unseen | known | unknown

    // Skeleton
    app.innerHTML = `
        ${renderHeader("Vocabulary")}
        <div class="vocab-skeleton">
            <div class="sk-line sk-bar"></div>
            <div class="sk-line sk-text"></div>
            <div class="sk-line sk-filter"></div>
            <div class="sk-line sk-item"></div>
            <div class="sk-line sk-item"></div>
            <div class="sk-line sk-item"></div>
            <div class="sk-line sk-item"></div>
        </div>
    `;
    bindLogout();

    // Load words (cache → network)
    try {
        const cached = sessionStorage.getItem("toeflmate_vocab_cache");
        if (cached) words = JSON.parse(cached) || [];
    } catch {}

    try {
        const fresh = await API.get("/api/vocab");
        if (Array.isArray(fresh)) {
            words = fresh;
            try { sessionStorage.setItem("toeflmate_vocab_cache", JSON.stringify(fresh)); } catch {}
        }
    } catch {
        if (!words.length) {
            renderError();
            return;
        }
    }

    if (!words.length) {
        renderEmpty();
        return;
    }

    render();

    function counts() {
        let known = 0, unknown = 0, unseen = 0;
        for (const w of words) {
            const st = statusOf(progress, w.id);
            if (st === "known") known++;
            else if (st === "unknown") unknown++;
            else unseen++;
        }
        return { known, unknown, unseen, total: words.length };
    }

    function filteredWords() {
        if (filter === "all") return words.map((w, i) => ({ w, i }));
        return words
            .map((w, i) => ({ w, i }))
            .filter(({ w }) => {
                const st = statusOf(progress, w.id);
                if (filter === "unseen") return st === "unseen";
                if (filter === "known") return st === "known";
                if (filter === "unknown") return st === "unknown";
                return true;
            });
    }

    function render() {
        const c = counts();
        const pct = c.total ? Math.round((c.known / c.total) * 100) : 0;
        const lastIdx = loadLastIndex();
        let resumeWord = null;
        if (lastIdx != null && lastIdx >= 0 && lastIdx < words.length) {
            const w = words[lastIdx];
            if (w && statusOf(progress, w.id) !== "known") {
                resumeWord = { idx: lastIdx, word: w };
            }
        }

        const filteredList = filteredWords();

        app.innerHTML = `
            ${renderHeader("Vocabulary")}
            <div class="vocab-header-actions">
                <button class="btn btn-sm btn-secondary" id="vocab-reset">초기화</button>
                <button class="btn btn-sm btn-primary" id="vocab-start">▶ 학습 시작</button>
            </div>
            <div class="vocab-progress-wrap">
                <div class="vocab-progress-bar">
                    <div class="vocab-progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="vocab-progress-text">${c.known} / ${c.total} (${pct}%)</div>
                <div class="vocab-progress-sub">
                    <span style="color:var(--success)">✓ 아는단어 ${c.known}</span>
                    <span class="vocab-sep">|</span>
                    <span style="color:var(--danger)">✕ 모름 ${c.unknown}</span>
                    <span class="vocab-sep">|</span>
                    <span style="color:var(--text-dim)">○ 미학습 ${c.unseen}</span>
                </div>
            </div>
            <div class="mode-selector vocab-filter-tabs">
                <button class="mode-btn ${filter==='all'?'active':''}" data-filter="all">전체 ${c.total}</button>
                <button class="mode-btn ${filter==='unseen'?'active':''}" data-filter="unseen">미학습 ${c.unseen}</button>
                <button class="mode-btn ${filter==='known'?'active':''}" data-filter="known">아는단어 ${c.known}</button>
                <button class="mode-btn ${filter==='unknown'?'active':''}" data-filter="unknown">모름 ${c.unknown}</button>
            </div>
            ${resumeWord ? `
                <div class="vocab-resume" data-idx="${resumeWord.idx}">
                    <div class="vocab-resume-label">🔄 이어서 학습</div>
                    <div class="vocab-resume-text">${resumeWord.idx + 1}번째 "${escapeHtml(resumeWord.word.word)}"부터 계속하기</div>
                    <button class="btn btn-sm btn-primary vocab-resume-btn">▶</button>
                </div>
            ` : ""}
            <div class="vocab-list">
                ${filteredList.length === 0
                    ? `<div class="vocab-empty-filter">이 필터에 해당하는 단어가 없어요.</div>`
                    : filteredList.map(({ w, i }) => renderItem(w, i)).join("")}
            </div>
        `;
        bindLogout();
        bindEvents();
    }

    function renderItem(w, origIdx) {
        const st = statusOf(progress, w.id);
        const stateLabel = st === "known"
            ? `<span class="vocab-state known">✓ 아는</span>`
            : st === "unknown"
            ? `<span class="vocab-state unknown">✕ 모름</span>`
            : `<span class="vocab-state unseen">○ 미학습</span>`;
        const pCls = posClass(w.pos);
        return `
            <div class="vocab-list-item ${st}" data-idx="${origIdx}">
                <div class="vocab-list-index">#${origIdx + 1}</div>
                ${w.pos ? `<div class="pos-badge ${pCls}">${escapeHtml(w.pos)}</div>` : ""}
                <div class="vocab-list-main">
                    <div class="vocab-list-word">${escapeHtml(w.word)}</div>
                    <div class="vocab-list-meaning">${escapeHtml(w.meaning)}</div>
                </div>
                ${stateLabel}
            </div>
        `;
    }

    function bindEvents() {
        document.getElementById("vocab-start")?.addEventListener("click", () => {
            location.hash = "#/vocab/study";
        });
        document.getElementById("vocab-reset")?.addEventListener("click", () => {
            if (!confirm("모든 학습 진행 상황을 초기화할까요? 아는단어/모르는단어 기록이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.")) return;
            clearProgress();
            clearLastIndex();
            clearSwipeHintSeen();
            progress = {};
            showToast("초기화되었습니다");
            render();
        });
        app.querySelectorAll(".mode-btn[data-filter]").forEach((btn) => {
            btn.addEventListener("click", () => {
                filter = btn.dataset.filter;
                render();
            });
        });
        app.querySelectorAll(".vocab-list-item").forEach((el) => {
            el.addEventListener("click", () => {
                const idx = parseInt(el.dataset.idx, 10);
                location.hash = `#/vocab/study?start=${idx}`;
            });
        });
        const resume = app.querySelector(".vocab-resume");
        if (resume) {
            resume.addEventListener("click", () => {
                const idx = parseInt(resume.dataset.idx, 10);
                location.hash = `#/vocab/study?start=${idx}`;
            });
        }
    }

    function renderError() {
        app.innerHTML = `
            ${renderHeader("Vocabulary")}
            <div class="vocab-error-state">
                <div class="vocab-error-icon">⚠️</div>
                <div class="vocab-error-title">단어 데이터를 불러올 수 없어요</div>
                <div class="vocab-error-msg">인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.</div>
                <div class="vocab-error-actions">
                    <button class="btn btn-primary" id="err-retry">🔄 다시 시도</button>
                    <button class="btn btn-secondary" onclick="location.hash='#/'">홈으로</button>
                </div>
            </div>
        `;
        bindLogout();
        document.getElementById("err-retry").addEventListener("click", () => VocabPage(app));
    }

    function renderEmpty() {
        app.innerHTML = `
            ${renderHeader("Vocabulary")}
            <div class="vocab-error-state">
                <div class="vocab-error-icon">📭</div>
                <div class="vocab-error-title">등록된 단어가 없습니다</div>
                <div class="vocab-error-msg">관리자에게 문의하거나 나중에 다시 방문해주세요.</div>
                <div class="vocab-error-actions">
                    <button class="btn btn-secondary" onclick="location.hash='#/'">홈으로 돌아가기</button>
                </div>
            </div>
        `;
        bindLogout();
    }
}

import API from "../lib/api.js";
import { renderHeader, bindLogout } from "../components/nav.js";
import {
    loadProgress, saveProgress, clearProgress, markWord,
    saveLastIndex, clearLastIndex, statusOf,
    buildQueue, posClass, escapeHtml, showToast,
    loadSoundEnabled, saveSoundEnabled, playSound,
    isStorageOk,
} from "../lib/vocab-utils.js";

export default async function VocabStudyPage(app, opts = {}) {
    let allWords = [];
    let progress = loadProgress();
    let queue = [];
    let queueIndex = 0;
    let stage = "A"; // A | B | C
    let sessionStats = { known: 0, unknown: 0 };
    const mode = opts.mode || null;
    const startIdx = Number.isFinite(opts.start) ? opts.start : null;

    // Load words (cache first)
    try {
        const cached = sessionStorage.getItem("toeflmate_vocab_cache");
        if (cached) allWords = JSON.parse(cached) || [];
    } catch {}

    try {
        const fresh = await API.get("/api/vocab");
        if (Array.isArray(fresh)) {
            allWords = fresh;
            try { sessionStorage.setItem("toeflmate_vocab_cache", JSON.stringify(fresh)); } catch {}
        }
    } catch {
        if (!allWords.length) {
            renderError();
            return;
        }
    }

    if (!allWords.length) { renderError(); return; }

    // Check: all mastered
    const allKnown = allWords.every((w) => statusOf(progress, w.id) === "known");
    if (allKnown && !mode) {
        renderAllMastered();
        return;
    }

    // Build queue
    queue = buildQueue(allWords, progress, mode);

    if (mode === "unknown" && queue.length === 0) {
        showToast("모르는 단어가 없어요 👏");
        location.hash = "#/vocab";
        return;
    }

    if (queue.length === 0) {
        renderComplete();
        return;
    }

    // start=N rotation (original index in allWords)
    if (startIdx != null && startIdx >= 0 && startIdx < allWords.length) {
        const target = allWords[startIdx];
        const pos = queue.findIndex((w) => w.id === target.id);
        if (pos > 0) {
            queue = [...queue.slice(pos), ...queue.slice(0, pos)];
        }
    }

    renderCard();

    // -------- Rendering --------

    function currentWord() { return queue[queueIndex]; }

    function liveCounts() {
        let known = 0, unknown = 0, unseen = 0;
        for (const w of allWords) {
            const s = statusOf(progress, w.id);
            if (s === "known") known++;
            else if (s === "unknown") unknown++;
            else unseen++;
        }
        return { known, unknown, unseen };
    }

    function wordFontClass(word) {
        const raw = (word || "").trim();
        if (raw.length >= 15) return "vocab-word-large"; // reduce size
        return "";
    }

    function renderShell(bodyHtml, hintHtml = "") {
        const w = currentWord();
        const c = liveCounts();
        const total = allWords.length;
        const pct = total ? ((queueIndex + 1) / queue.length) * 100 : 0;
        const soundOn = loadSoundEnabled();

        app.innerHTML = `
            ${renderHeader("Vocabulary 암기")}
            <div class="vs-toolbar">
                <button class="btn btn-sm btn-secondary" id="vs-back">← 목록</button>
                <div class="vs-header-right">
                    <button class="vs-icon-btn" id="vs-sound" title="사운드 토글">${soundOn ? "🔊" : "🔇"}</button>
                    <div class="vs-jump-wrap">
                        <button class="btn btn-sm btn-secondary" id="vs-jump-btn">단어 점프 ▾</button>
                        <div class="vs-jump-panel hidden" id="vs-jump-panel">
                            <input type="text" class="form-input vs-jump-search" id="vs-jump-search" placeholder="🔍 단어 검색..." />
                            <div class="vs-jump-list" id="vs-jump-list"></div>
                        </div>
                    </div>
                </div>
            </div>
            ${!isStorageOk() ? `<div class="vocab-warn-banner">⚠️ 브라우저 저장소 접근 불가 — 진행 상황이 저장되지 않습니다</div>` : ""}
            <div class="vs-progress-wrap">
                <div class="vs-progress-bar"><div class="vs-progress-fill" style="width:${pct}%"></div></div>
                <div class="vs-progress-text">${queueIndex + 1} / ${queue.length}</div>
                <div class="vs-progress-sub">
                    <span style="color:var(--success)">✓ ${c.known}</span>
                    <span class="vocab-sep">|</span>
                    <span style="color:var(--danger)">✕ ${c.unknown}</span>
                    <span class="vocab-sep">|</span>
                    <span style="color:var(--text-dim)">○ ${c.unseen}</span>
                </div>
            </div>
            <div class="vocab-flash-card-wrapper" id="vs-card-wrap">
                ${bodyHtml}
            </div>
            <div class="vs-nav">
                <button class="btn btn-secondary btn-sm" id="vs-prev" ${queueIndex === 0 ? "disabled" : ""}>← 이전</button>
                <div class="vs-kb-hint">${hintHtml}</div>
                <button class="btn btn-secondary btn-sm" id="vs-next">다음 →</button>
            </div>
        `;
        bindLogout();
        bindShellEvents();
    }

    function renderCard() {
        const w = currentWord();
        if (!w) { renderComplete(); return; }
        saveLastIndex(allWords.findIndex((x) => x.id === w.id));

        if (stage === "A") renderStageA();
        else if (stage === "B") renderStageB();
        else renderStageC();
    }

    function renderStageA() {
        const w = currentWord();
        const pCls = posClass(w.pos);
        const wCls = wordFontClass(w.word);
        const isTouch = "ontouchstart" in window;
        const hint = isTouch ? "탭하거나 위로 스와이프" : "Space / 클릭으로 뒤집기";
        const body = `
            <div class="vocab-flash-card stage-a" id="vs-card" tabindex="0">
                ${w.pos ? `<div class="pos-badge ${pCls}">${escapeHtml(w.pos)}</div>` : ""}
                <div class="vocab-word ${wCls}">${escapeHtml(w.word)}</div>
                <div class="vocab-stage-hint">${hint}</div>
                <div class="vocab-blur-preview">${escapeHtml(w.meaning)}</div>
            </div>
        `;
        renderShell(body, "Space: 뒤집기 · ← 이전 · Esc: 목록 · J: 점프");
        const card = document.getElementById("vs-card");
        card.addEventListener("click", () => flipToB());
        bindSwipe(card, { onUp: flipToB, onLeft: prevCard });
        card.focus();
    }

    function renderStageB() {
        const w = currentWord();
        const pCls = posClass(w.pos);
        const wCls = wordFontClass(w.word);
        const body = `
            <div class="vocab-flash-card stage-b" id="vs-card" tabindex="0">
                ${w.pos ? `<div class="pos-badge ${pCls}">${escapeHtml(w.pos)}</div>` : ""}
                <div class="vocab-word ${wCls}">${escapeHtml(w.word)}</div>
                <div class="vocab-divider"></div>
                <div class="vocab-meaning-big">${escapeHtml(w.meaning)}</div>
                <div class="vocab-rate-buttons">
                    <button class="btn btn-danger vs-rate-btn" id="vs-rate-unknown">
                        ✕ 모르는단어<span class="kbd-hint">[2]</span>
                    </button>
                    <button class="btn btn-success vs-rate-btn" id="vs-rate-known">
                        ✓ 아는단어<span class="kbd-hint">[1]</span>
                    </button>
                </div>
                <div class="vs-swipe-overlay-left">✕</div>
                <div class="vs-swipe-overlay-right">✓</div>
            </div>
        `;
        renderShell(body, "1: 아는 · 2: 모름 · ←/→: 평가 · Esc: 목록");
        const card = document.getElementById("vs-card");
        document.getElementById("vs-rate-known").addEventListener("click", (e) => {
            e.stopPropagation();
            pulseBtn(e.currentTarget, "success");
            rateAndAdvance("known");
        });
        document.getElementById("vs-rate-unknown").addEventListener("click", (e) => {
            e.stopPropagation();
            pulseBtn(e.currentTarget, "danger");
            rateAndAdvance("unknown");
        });
        bindSwipe(card, {
            onRight: () => rateAndAdvance("known"),
            onLeft: () => rateAndAdvance("unknown"),
            drag: true,
        });
    }

    function renderStageC() {
        const w = currentWord();
        const pCls = posClass(w.pos);
        const synonyms = Array.isArray(w.synonyms) ? w.synonyms : [];
        const isLast = queueIndex >= queue.length - 1;
        const body = `
            <div class="vocab-flash-card stage-c" id="vs-card" tabindex="0">
                <div class="vocab-c-header">
                    ${w.pos ? `<div class="pos-badge ${pCls}">${escapeHtml(w.pos)}</div>` : ""}
                    <div class="vocab-c-word">${escapeHtml(w.word)}</div>
                    <div class="vocab-c-meaning">${escapeHtml(w.meaning)}</div>
                </div>
                ${synonyms.length ? `
                    <div class="vocab-c-syn-label">─── 유의어 ${synonyms.length}개 ───</div>
                    <div class="vocab-syn-rows">
                        ${synonyms.map((s, i) => `
                            <div class="vocab-syn-row" style="animation-delay:${i * 0.08}s">
                                <div class="vocab-syn-en">${escapeHtml(s.word || "")}</div>
                                <div class="vocab-syn-ko">${escapeHtml(s.meaning || "")}</div>
                            </div>
                        `).join("")}
                    </div>
                ` : `<div class="vocab-c-no-syn">(등록된 유의어가 없습니다)</div>`}
                <button class="btn btn-primary btn-block vs-next-btn" id="vs-next-word">
                    ${isLast ? "🎉 학습 완료 보기" : "▶ 다음 단어"}
                </button>
            </div>
        `;
        renderShell(body, "Space/Enter/→: 다음 · ← 이전 · Esc: 목록");
        const card = document.getElementById("vs-card");
        document.getElementById("vs-next-word").addEventListener("click", (e) => {
            e.stopPropagation();
            nextCard();
        });
        bindSwipe(card, { onRight: nextCard, onLeft: prevCard });
    }

    // -------- Actions --------

    function flipToB() {
        stage = "B";
        renderCard();
    }

    function rateAndAdvance(status) {
        const w = currentWord();
        markWord(progress, w.id, status);
        if (status === "known") sessionStats.known++;
        else sessionStats.unknown++;
        playSound(status);
        stage = "C";
        renderCard();
    }

    function nextCard() {
        if (queueIndex >= queue.length - 1) {
            renderComplete();
            return;
        }
        queueIndex++;
        stage = "A";
        renderCard();
    }

    function prevCard() {
        if (queueIndex <= 0) return;
        queueIndex--;
        stage = "A";
        renderCard();
    }

    function pulseBtn(el, kind) {
        el.classList.add(kind === "success" ? "pulsing-success" : "pulsing-danger");
        setTimeout(() => el.classList.remove("pulsing-success", "pulsing-danger"), 420);
    }

    // -------- Shell events --------

    function bindShellEvents() {
        document.getElementById("vs-back").addEventListener("click", () => {
            location.hash = "#/vocab";
        });
        document.getElementById("vs-prev").addEventListener("click", prevCard);
        document.getElementById("vs-next").addEventListener("click", () => {
            // skip without rating
            if (stage === "C") { nextCard(); return; }
            if (queueIndex < queue.length - 1) { queueIndex++; stage = "A"; renderCard(); }
            else renderComplete();
        });
        document.getElementById("vs-sound").addEventListener("click", () => {
            saveSoundEnabled(!loadSoundEnabled());
            renderCard();
        });

        // Jump dropdown
        const jumpBtn = document.getElementById("vs-jump-btn");
        const panel = document.getElementById("vs-jump-panel");
        const searchInput = document.getElementById("vs-jump-search");
        const listEl = document.getElementById("vs-jump-list");

        function openJump() {
            panel.classList.remove("hidden");
            renderJumpList("");
            setTimeout(() => searchInput.focus(), 20);
        }
        function closeJump() {
            panel.classList.add("hidden");
        }
        function renderJumpList(filter) {
            const f = (filter || "").toLowerCase();
            const items = allWords
                .map((w, i) => ({ w, i }))
                .filter(({ w }) => !f || w.word.toLowerCase().includes(f));
            listEl.innerHTML = items.map(({ w, i }) => {
                const st = statusOf(progress, w.id);
                const icon = st === "known" ? `<span style="color:var(--success)">✓</span>`
                    : st === "unknown" ? `<span style="color:var(--danger)">✕</span>`
                    : `<span style="color:var(--text-dim)">○</span>`;
                return `<div class="vs-jump-item" data-idx="${i}">
                    <span class="vs-jump-num">#${i + 1}</span>
                    <span class="vs-jump-word">${escapeHtml(w.word)}</span>
                    ${icon}
                </div>`;
            }).join("") || `<div class="vs-jump-empty">결과 없음</div>`;
            listEl.querySelectorAll(".vs-jump-item").forEach((el) => {
                el.addEventListener("click", () => {
                    const idx = parseInt(el.dataset.idx, 10);
                    closeJump();
                    jumpToWord(idx);
                });
            });
        }
        jumpBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (panel.classList.contains("hidden")) openJump();
            else closeJump();
        });
        searchInput?.addEventListener("input", () => renderJumpList(searchInput.value));
        document.onclick = (e) => {
            if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== jumpBtn && !jumpBtn.contains(e.target)) {
                closeJump();
            }
        };

        // Global keys
        document.onkeydown = (e) => {
            if (!panel.classList.contains("hidden")) {
                if (e.key === "Escape") { closeJump(); e.preventDefault(); }
                return;
            }
            if (e.key === "Escape") { location.hash = "#/vocab"; return; }
            if (e.key === "j" || e.key === "J") { e.preventDefault(); openJump(); return; }

            if (stage === "A") {
                if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") { e.preventDefault(); flipToB(); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); prevCard(); }
            } else if (stage === "B") {
                if (e.key === "1" || e.key === "ArrowRight") { e.preventDefault(); rateAndAdvance("known"); }
                else if (e.key === "2" || e.key === "ArrowLeft") { e.preventDefault(); rateAndAdvance("unknown"); }
                // Space/Enter disabled in Stage B (force evaluation)
            } else if (stage === "C") {
                if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault(); nextCard();
                } else if (e.key === "ArrowLeft") { e.preventDefault(); prevCard(); }
            }
        };
    }

    function jumpToWord(origIdx) {
        const target = allWords[origIdx];
        if (!target) return;
        const pos = queue.findIndex((w) => w.id === target.id);
        if (pos >= 0) {
            queue = [...queue.slice(pos), ...queue.slice(0, pos)];
            queueIndex = 0;
        }
        stage = "A";
        renderCard();
    }

    // -------- Swipe --------

    function bindSwipe(el, { onLeft, onRight, onUp, drag } = {}) {
        let startX = 0, startY = 0, startT = 0;
        let dragging = false;
        let lastDx = 0;

        el.addEventListener("touchstart", (e) => {
            const t = e.touches[0];
            startX = t.clientX; startY = t.clientY; startT = Date.now();
            dragging = true; lastDx = 0;
        }, { passive: true });

        el.addEventListener("touchmove", (e) => {
            if (!dragging) return;
            const t = e.touches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            lastDx = dx;
            if (drag && Math.abs(dx) > Math.abs(dy)) {
                el.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
                const leftOv = el.querySelector(".vs-swipe-overlay-left");
                const rightOv = el.querySelector(".vs-swipe-overlay-right");
                if (dx > 0) {
                    if (rightOv) rightOv.style.opacity = Math.min(Math.abs(dx) / 80, 1);
                    if (leftOv) leftOv.style.opacity = 0;
                    el.style.background = `linear-gradient(135deg, var(--bg-card), rgba(102,187,106,${Math.min(Math.abs(dx)/400, 0.2)}))`;
                } else {
                    if (leftOv) leftOv.style.opacity = Math.min(Math.abs(dx) / 80, 1);
                    if (rightOv) rightOv.style.opacity = 0;
                    el.style.background = `linear-gradient(135deg, rgba(239,83,80,${Math.min(Math.abs(dx)/400, 0.2)}), var(--bg-card))`;
                }
            }
        }, { passive: true });

        el.addEventListener("touchend", (e) => {
            if (!dragging) return;
            dragging = false;
            const dt = Date.now() - startT;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const velocity = Math.abs(dx) / Math.max(dt, 1);
            const absX = Math.abs(dx), absY = Math.abs(dy);

            // reset
            if (drag) {
                el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s";
                el.style.transform = "";
                el.style.background = "";
                const lo = el.querySelector(".vs-swipe-overlay-left");
                const ro = el.querySelector(".vs-swipe-overlay-right");
                if (lo) lo.style.opacity = 0;
                if (ro) ro.style.opacity = 0;
                setTimeout(() => { el.style.transition = ""; }, 260);
            }

            const triggered = absX > 50 || velocity > 0.3;
            if (absY > absX) {
                // vertical
                if (dy < -50 && onUp) onUp();
                return;
            }
            if (!triggered) return;
            if (dx > 0 && onRight) onRight();
            else if (dx < 0 && onLeft) onLeft();
        });
    }

    // -------- Completion screens --------

    function renderComplete() {
        clearLastIndex();
        const c = liveCounts();
        const unknownCount = c.unknown;
        playSound("complete");
        app.innerHTML = `
            ${renderHeader("Vocabulary 완료")}
            <div class="vocab-complete">
                <div class="completion-emoji">🎉</div>
                <h2 class="vocab-complete-title">학습 완료!</h2>
                <p class="vocab-complete-sub">오늘 ${queue.length}단어 모두 다 봤어요</p>
                <div class="vocab-complete-tiles">
                    <div class="vocab-tile">
                        <div class="vocab-tile-num" style="color:var(--success)">${c.known}</div>
                        <div class="vocab-tile-label">아는단어</div>
                    </div>
                    <div class="vocab-tile">
                        <div class="vocab-tile-num" style="color:var(--danger)">${c.unknown}</div>
                        <div class="vocab-tile-label">모르는단어</div>
                    </div>
                    <div class="vocab-tile">
                        <div class="vocab-tile-num" style="color:var(--text-dim)">${c.unseen}</div>
                        <div class="vocab-tile-label">미학습</div>
                    </div>
                </div>
                ${unknownCount === 0 ? `<div class="vocab-complete-praise">모르는 단어가 없어요 👏</div>` : ""}
                <button class="btn btn-danger btn-block" id="vc-unknown" ${unknownCount === 0 ? "disabled" : ""}>
                    ✕ 모르는단어만 다시 학습 (${unknownCount})
                </button>
                <button class="btn btn-secondary btn-block" id="vc-restart">↺ 처음부터 다시 학습</button>
                <a class="vocab-complete-back" id="vc-back">← 목록으로 돌아가기</a>
            </div>
        `;
        bindLogout();
        document.getElementById("vc-unknown").addEventListener("click", () => {
            location.hash = "#/vocab/study?mode=unknown";
        });
        document.getElementById("vc-restart").addEventListener("click", () => {
            location.hash = "#/vocab/study";
            // Force reload if already on same hash
            setTimeout(() => VocabStudyPage(app, {}), 0);
        });
        document.getElementById("vc-back").addEventListener("click", () => {
            location.hash = "#/vocab";
        });
    }

    function renderAllMastered() {
        app.innerHTML = `
            ${renderHeader("Vocabulary")}
            <div class="vocab-complete">
                <div class="completion-emoji">🏆</div>
                <h2 class="vocab-complete-title">${allWords.length}개 단어 모두 완료!</h2>
                <p class="vocab-complete-sub">모든 단어를 마스터했어요. 복습하거나 초기화하고 다시 시작하세요.</p>
                <button class="btn btn-primary btn-block" id="vm-review">🔄 복습 모드로 시작</button>
                <button class="btn btn-secondary btn-block" id="vm-reset">↺ 진행 상황 초기화</button>
                <a class="vocab-complete-back" id="vm-back">← 목록 보기</a>
            </div>
        `;
        bindLogout();
        document.getElementById("vm-review").addEventListener("click", () => {
            // Force a review queue: all words, tier3 only
            queue = buildQueue(allWords, progress, null);
            queueIndex = 0;
            stage = "A";
            renderCard();
        });
        document.getElementById("vm-reset").addEventListener("click", () => {
            if (!confirm("모든 학습 진행 상황을 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;
            clearProgress();
            clearLastIndex();
            progress = {};
            showToast("초기화되었습니다");
            VocabStudyPage(app, {});
        });
        document.getElementById("vm-back").addEventListener("click", () => {
            location.hash = "#/vocab";
        });
    }

    function renderError() {
        const hasCache = !!sessionStorage.getItem("toeflmate_vocab_cache");
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
        document.getElementById("err-retry").addEventListener("click", () => VocabStudyPage(app, opts));
    }
}

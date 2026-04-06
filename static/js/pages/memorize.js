import API from "../lib/api.js";
import { renderHeader, bindLogout } from "../components/nav.js";

export default async function MemorizePage(app, type) {
    const typeLabels = {
        speaking_interview: "Speaking Interview",
        writing_email: "Writing Email",
        writing_discussion: "Writing Discussion",
    };

    let questions = [];
    let index = 0;
    let revealed = false;
    let memoMode = localStorage.getItem("memo_typing_mode") || "view";
    let answerRevealed = false;

    try {
        questions = await API.get(`/api/questions?type=${type}`);
    } catch {}

    if (!questions.length) {
        app.innerHTML = `
            ${renderHeader(typeLabels[type] + " - 암기")}
            <div class="card text-center">
                <h2>등록된 문제가 없습니다</h2>
                <p class="text-muted mt-8">문제 관리에서 문제를 먼저 추가해주세요.</p>
                <button class="btn btn-primary mt-24" onclick="location.hash='#/'">홈으로</button>
            </div>
        `;
        bindLogout();
        return;
    }

    function escapeHtml(s) {
        return (s || "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function render() {
        const q = questions[index];

        const modeToggleHtml = `
            <div class="memo-mode-toggle">
                <button class="memo-mode-btn ${memoMode === 'view' ? 'active' : ''}" data-mode="view">👁 보기</button>
                <button class="memo-mode-btn ${memoMode === 'typing' ? 'active' : ''}" data-mode="typing">✏️ 타이핑</button>
            </div>
        `;

        if (memoMode === "typing") {
            renderTypingMode(q, modeToggleHtml);
        } else {
            renderViewMode(q, modeToggleHtml);
        }
    }

    function renderViewMode(q, modeToggleHtml) {
        app.innerHTML = `
            ${renderHeader(typeLabels[type] + " - 암기")}
            <div class="memorize-jump-wrap" id="jump-wrap">
                <button class="memorize-jump-btn" id="jump-btn" title="문제 선택">
                    문제 ${index + 1} / ${questions.length} ▾
                </button>
                <div class="memorize-jump-list hidden" id="jump-list">
                    ${questions.map((item, i) => {
                        const preview = (item.prompt_text || "").trim();
                        const short = preview.length > 60 ? preview.slice(0, 60) + "…" : preview;
                        return `<button class="memorize-jump-item ${i === index ? 'active' : ''}" data-idx="${i}">
                            <span class="jump-num">${i + 1}</span>
                            <span class="jump-preview">${escapeHtml(short)}</span>
                        </button>`;
                    }).join('')}
                </div>
            </div>
            ${modeToggleHtml}
            <div class="memorize-card">
                <div class="memorize-question">${escapeHtml(q.prompt_text)}</div>
                <div class="memorize-answer ${revealed ? '' : 'hidden'}" id="answer-area">
                    ${escapeHtml(q.template_answer || "(템플릿 없음)")}
                </div>
            </div>
            ${!revealed ? `
                <button class="btn btn-primary btn-block mt-16" id="reveal-btn">답변 보기</button>
            ` : ""}
            <div class="memorize-nav mt-16">
                <button class="btn btn-secondary" id="prev-btn">← 이전</button>
                <button class="btn btn-secondary" onclick="location.hash='#/'">홈으로</button>
                <button class="btn btn-primary" id="next-btn">다음 →</button>
            </div>
        `;
        bindLogout();
        bindModeToggle();
        bindJumpDropdown();

        const revealBtn = document.getElementById("reveal-btn");
        if (revealBtn) {
            revealBtn.addEventListener("click", () => {
                revealed = true;
                render();
            });
        }

        const answerArea = document.getElementById("answer-area");
        if (answerArea && !revealed) {
            answerArea.addEventListener("click", () => {
                revealed = true;
                render();
            });
        }

        bindNav();
        bindKeys();
        bindSwipe();
    }

    function renderTypingMode(q, modeToggleHtml) {
        const templateAnswer = q.template_answer || "";
        const templateLength = templateAnswer.length;

        app.innerHTML = `
            ${renderHeader(typeLabels[type] + " - 암기")}
            <div class="memorize-jump-wrap" id="jump-wrap">
                <button class="memorize-jump-btn" id="jump-btn" title="문제 선택">
                    문제 ${index + 1} / ${questions.length} ▾
                </button>
                <div class="memorize-jump-list hidden" id="jump-list">
                    ${questions.map((item, i) => {
                        const preview = (item.prompt_text || "").trim();
                        const short = preview.length > 60 ? preview.slice(0, 60) + "…" : preview;
                        return `<button class="memorize-jump-item ${i === index ? 'active' : ''}" data-idx="${i}">
                            <span class="jump-num">${i + 1}</span>
                            <span class="jump-preview">${escapeHtml(short)}</span>
                        </button>`;
                    }).join('')}
                </div>
            </div>
            ${modeToggleHtml}
            <div class="memorize-card memo-typing-scroll-area" id="memo-scroll">
                <div class="memorize-question">${escapeHtml(q.prompt_text)}</div>
                <div class="memo-answer-toggle ${answerRevealed ? 'revealed' : ''}" id="answer-toggle">
                    <div class="memo-answer-toggle-label">${answerRevealed ? '모범 답안' : '탭하여 답안 보기'}</div>
                    <div class="memo-answer-toggle-content">${escapeHtml(templateAnswer || "(템플릿 없음)")}</div>
                </div>
            </div>
            <div class="memo-typing-dock" id="typing-dock">
                <div class="memo-typing-dock-row">
                    <button class="btn btn-secondary btn-sm" id="prev-btn">←</button>
                    <div class="memo-char-count" id="char-count">0 / ${templateLength}</div>
                    <button class="btn btn-primary btn-sm" id="next-btn">→</button>
                </div>
                <textarea class="memo-typing-area" id="typing-area" placeholder="여기에 답변을 입력하세요..." rows="3"></textarea>
            </div>
        `;
        bindLogout();
        bindModeToggle();
        bindJumpDropdown();

        // Answer toggle
        const answerToggle = document.getElementById("answer-toggle");
        if (answerToggle) {
            answerToggle.addEventListener("click", () => {
                answerRevealed = !answerRevealed;
                answerToggle.classList.toggle("revealed", answerRevealed);
                answerToggle.querySelector(".memo-answer-toggle-label").textContent =
                    answerRevealed ? "모범 답안" : "탭하여 답안 보기";
            });
        }

        // Character count
        const typingArea = document.getElementById("typing-area");
        const charCount = document.getElementById("char-count");
        if (typingArea && charCount) {
            typingArea.addEventListener("input", () => {
                charCount.textContent = `${typingArea.value.length} / ${templateLength}`;
            });
        }

        bindNav();
        bindTypingKeys();
        bindSwipe();
    }

    function bindModeToggle() {
        app.querySelectorAll(".memo-mode-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const newMode = btn.dataset.mode;
                if (newMode !== memoMode) {
                    memoMode = newMode;
                    localStorage.setItem("memo_typing_mode", memoMode);
                    revealed = false;
                    answerRevealed = false;
                    render();
                }
            });
        });
    }

    function bindJumpDropdown() {
        const jumpBtn = document.getElementById("jump-btn");
        const jumpList = document.getElementById("jump-list");
        jumpBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            jumpList.classList.toggle("hidden");
            if (!jumpList.classList.contains("hidden")) {
                const active = jumpList.querySelector(".memorize-jump-item.active");
                if (active) active.scrollIntoView({ block: "center" });
            }
        });
        jumpList.querySelectorAll("[data-idx]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const newIdx = parseInt(btn.dataset.idx);
                if (newIdx !== index) {
                    index = newIdx;
                    revealed = false;
                    answerRevealed = false;
                }
                render();
            });
        });
        const closeDropdown = (e) => {
            const wrap = document.getElementById("jump-wrap");
            if (wrap && !wrap.contains(e.target)) {
                jumpList?.classList.add("hidden");
                document.removeEventListener("click", closeDropdown);
            }
        };
        document.addEventListener("click", closeDropdown);
    }

    function bindNav() {
        document.getElementById("prev-btn").addEventListener("click", () => {
            index = index > 0 ? index - 1 : questions.length - 1;
            revealed = false;
            answerRevealed = false;
            render();
        });
        document.getElementById("next-btn").addEventListener("click", () => {
            index = index < questions.length - 1 ? index + 1 : 0;
            revealed = false;
            answerRevealed = false;
            render();
        });
    }

    function bindKeys() {
        document.onkeydown = (e) => {
            if (e.key === "ArrowLeft") { index = index > 0 ? index - 1 : questions.length - 1; revealed = false; answerRevealed = false; render(); }
            else if (e.key === "ArrowRight") { index = index < questions.length - 1 ? index + 1 : 0; revealed = false; answerRevealed = false; render(); }
            else if (e.key === " " || e.key === "Enter") { e.preventDefault(); revealed = true; render(); }
        };
    }

    function bindTypingKeys() {
        document.onkeydown = (e) => {
            // Don't intercept when typing in textarea
            if (e.target && e.target.tagName === "TEXTAREA") return;
            if (e.key === "ArrowLeft") { index = index > 0 ? index - 1 : questions.length - 1; revealed = false; answerRevealed = false; render(); }
            else if (e.key === "ArrowRight") { index = index < questions.length - 1 ? index + 1 : 0; revealed = false; answerRevealed = false; render(); }
        };
    }

    function bindSwipe() {
        let startX = 0;
        app.ontouchstart = (e) => { startX = e.touches[0].clientX; };
        app.ontouchend = (e) => {
            const diff = e.changedTouches[0].clientX - startX;
            if (Math.abs(diff) > 60) {
                if (diff > 0) { index = index > 0 ? index - 1 : questions.length - 1; }
                else { index = index < questions.length - 1 ? index + 1 : 0; }
                revealed = false;
                answerRevealed = false;
                render();
            }
        };
    }

    render();
}

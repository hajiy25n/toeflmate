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
                <button class="btn btn-secondary" id="prev-btn" ${index === 0 ? 'disabled' : ''}>← 이전</button>
                <button class="btn btn-secondary" onclick="location.hash='#/'">홈으로</button>
                <button class="btn btn-primary" id="next-btn" ${index === questions.length - 1 ? 'disabled' : ''}>다음 →</button>
            </div>
        `;
        bindLogout();

        // Jump dropdown
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

        document.getElementById("prev-btn").addEventListener("click", () => {
            if (index > 0) { index--; revealed = false; render(); }
        });
        document.getElementById("next-btn").addEventListener("click", () => {
            if (index < questions.length - 1) { index++; revealed = false; render(); }
        });

        // Keyboard navigation
        document.onkeydown = (e) => {
            if (e.key === "ArrowLeft" && index > 0) { index--; revealed = false; render(); }
            else if (e.key === "ArrowRight" && index < questions.length - 1) { index++; revealed = false; render(); }
            else if (e.key === " " || e.key === "Enter") { e.preventDefault(); revealed = true; render(); }
        };

        // Touch swipe
        let startX = 0;
        app.ontouchstart = (e) => { startX = e.touches[0].clientX; };
        app.ontouchend = (e) => {
            const diff = e.changedTouches[0].clientX - startX;
            if (Math.abs(diff) > 60) {
                if (diff > 0 && index > 0) { index--; revealed = false; render(); }
                else if (diff < 0 && index < questions.length - 1) { index++; revealed = false; render(); }
            }
        };
    }

    render();
}

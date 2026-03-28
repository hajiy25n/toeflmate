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

    function render() {
        const q = questions[index];
        app.innerHTML = `
            ${renderHeader(typeLabels[type] + " - 암기")}
            <div class="memorize-progress">${index + 1} / ${questions.length}</div>
            <div class="memorize-card">
                <div class="memorize-question">${q.prompt_text}</div>
                <div class="memorize-answer ${revealed ? '' : 'hidden'}" id="answer-area">
                    ${q.template_answer || "(템플릿 없음)"}
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

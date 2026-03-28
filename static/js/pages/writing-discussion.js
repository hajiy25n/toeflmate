import API from "../lib/api.js";
import Store from "../lib/store.js";
import { renderHeader, bindLogout } from "../components/nav.js";
import { createElapsedTimer } from "../components/timer.js";
import { countWords, attachWordCounter } from "../components/word-counter.js";
import { renderDiff } from "../components/diff-view.js";

export default function WritingDiscussionPage(app) {
    let currentQuestion = null;
    let timerCtrl = null;

    function renderMenu() {
        app.innerHTML = `
            ${renderHeader("Writing Discussion")}
            <div class="mode-selector">
                <button class="mode-btn active">연습 모드</button>
                <button class="mode-btn" onclick="location.hash='#/writing-discussion/memorize'">암기 모드</button>
            </div>
            <div class="card">
                <h3>Academic Discussion Practice</h3>
                <p class="text-muted mt-8">교수 프롬프트와 학생 응답을 읽고 자신의 의견을 작성하세요.</p>
                <button class="btn btn-primary btn-block mt-24" id="start-btn">연습 시작</button>
            </div>
        `;
        bindLogout();
        document.getElementById("start-btn").addEventListener("click", startSession);
    }

    async function startSession() {
        try {
            const res = await API.post("/api/sessions", { type: "writing_discussion" });
            Store.startSession(res.session_id, "writing_discussion");
            await loadNextQuestion();
        } catch (e) {
            alert("세션 시작 실패: " + (e.error || ""));
        }
    }

    async function loadNextQuestion() {
        try {
            const res = await API.get(`/api/next-question?type=writing_discussion&exclude=${Store.getExcludeParam()}`);
            if (!res.ok) { renderDone(); return; }
            currentQuestion = res.question;
            Store.addUsedQuestion(currentQuestion.id);
            renderPractice();
        } catch { renderDone(); }
    }

    function renderPractice() {
        app.innerHTML = `
            ${renderHeader("Writing Discussion")}
            ${currentQuestion.professor_prompt ? `
                <div class="card mb-8">
                    <h3 class="text-muted" style="font-size:0.85rem">Professor's Prompt</h3>
                    <p class="mt-8" style="line-height:1.8;white-space:pre-line">${currentQuestion.professor_prompt}</p>
                </div>
            ` : ""}
            <div class="writing-header">
                <p style="line-height:1.8;white-space:pre-line">${currentQuestion.prompt_text}</p>
            </div>
            ${currentQuestion.student_response_1 ? `
                <div class="card mb-8" style="font-size:0.9rem">
                    <strong class="text-muted">Student 1:</strong>
                    <p class="mt-8" style="line-height:1.7;white-space:pre-line">${currentQuestion.student_response_1}</p>
                </div>
            ` : ""}
            ${currentQuestion.student_response_2 ? `
                <div class="card mb-8" style="font-size:0.9rem">
                    <strong class="text-muted">Student 2:</strong>
                    <p class="mt-8" style="line-height:1.7;white-space:pre-line">${currentQuestion.student_response_2}</p>
                </div>
            ` : ""}
            <div class="writing-toolbar">
                <div class="word-count" id="word-display">Words: <strong>0</strong></div>
                <div id="timer-slot"></div>
            </div>
            <textarea class="form-textarea" id="answer-area" placeholder="Write your response here..." style="min-height:240px"></textarea>
            <button class="btn btn-primary btn-block mt-16" id="submit-btn">제출</button>
        `;
        bindLogout();

        const textarea = document.getElementById("answer-area");
        attachWordCounter(textarea, document.getElementById("word-display"));

        timerCtrl = createElapsedTimer();
        document.getElementById("timer-slot").appendChild(timerCtrl.el);
        timerCtrl.start();

        document.getElementById("submit-btn").addEventListener("click", submitAnswer);
    }

    function submitAnswer() {
        if (timerCtrl) timerCtrl.stop();
        const answer = document.getElementById("answer-area").value;
        const elapsed = timerCtrl ? timerCtrl.getElapsed() : 0;
        const words = countWords(answer);
        showReview(answer, elapsed, words);
    }

    function showReview(answer, elapsed, words) {
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;

        app.innerHTML = `
            ${renderHeader("Writing Discussion")}
            <div class="review-question">
                <p style="white-space:pre-line">${currentQuestion.prompt_text}</p>
            </div>
            <div id="diff-area"></div>
            <div class="review-stats">
                <div><span class="stat-label">걸린 시간</span><span class="stat-value">${m}분 ${s}초</span></div>
                <div><span class="stat-label">단어 수</span><span class="stat-value">${words}</span></div>
            </div>
            <div class="flex gap-8 mt-16">
                <button class="btn btn-primary flex-1" id="next-btn">다음 문제</button>
                <button class="btn btn-secondary flex-1" id="end-btn">연습 종료</button>
            </div>
        `;
        bindLogout();

        const diffArea = document.getElementById("diff-area");
        if (currentQuestion.template_answer) {
            renderDiff(diffArea, answer, currentQuestion.template_answer);
        } else {
            diffArea.innerHTML = `<div class="card"><h3>My Answer</h3><p class="mt-8" style="line-height:1.8;white-space:pre-wrap">${answer}</p></div>`;
        }

        API.post(`/api/sessions/${Store.currentSession.id}/questions`, {
            question_id: currentQuestion.id, user_response: answer,
            elapsed_seconds: elapsed, word_count: words,
        }).catch(() => {});

        document.getElementById("next-btn").addEventListener("click", () => { timerCtrl = null; loadNextQuestion(); });
        document.getElementById("end-btn").addEventListener("click", () => { Store.endSession(); renderMenu(); });
    }

    function renderDone() {
        app.innerHTML = `
            ${renderHeader("Writing Discussion")}
            <div class="card text-center">
                <h2>모든 문제를 완료했습니다!</h2>
                <p class="text-muted mt-8">문제를 더 추가하려면 문제 관리에서 업로드하세요.</p>
                <button class="btn btn-primary mt-24" onclick="location.hash='#/'">홈으로</button>
            </div>
        `;
        bindLogout(); Store.endSession();
    }

    renderMenu();
}

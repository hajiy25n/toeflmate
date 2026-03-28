import API from "../lib/api.js";
import Store from "../lib/store.js";
import { renderHeader, bindLogout } from "../components/nav.js";
import { createTimer } from "../components/timer.js";
import { speak, stopSpeaking } from "../components/tts.js";
import { createRecorder } from "../components/recorder.js";

const RESPONSE_TIME = 45;

export default function SpeakingPage(app) {
    let currentQuestion = null;
    let recorder = createRecorder();
    let useRecording = false;
    let transcript = "";
    let timerCtrl = null;

    function renderMenu() {
        app.innerHTML = `
            ${renderHeader("Speaking Interview")}
            <div class="mode-selector">
                <button class="mode-btn active" data-mode="practice">연습 모드</button>
                <button class="mode-btn" onclick="location.hash='#/speaking/memorize'">암기 모드</button>
            </div>
            <div class="card">
                <h3>Speaking Interview Practice</h3>
                <p class="text-muted mt-8">인터뷰 질문이 TTS로 읽어지고, 45초 안에 답변하세요.</p>
                <div class="mt-16">
                    <label class="flex items-center gap-8" style="cursor:pointer">
                        <input type="checkbox" id="rec-toggle" ${useRecording ? 'checked' : ''}>
                        <span>녹음 + STT 사용</span>
                    </label>
                </div>
                <button class="btn btn-primary btn-block mt-24" id="start-btn">연습 시작</button>
            </div>
        `;
        bindLogout();
        document.getElementById("rec-toggle")?.addEventListener("change", async (e) => {
            if (e.target.checked) {
                const granted = await recorder.requestMicPermission();
                if (!granted) { e.target.checked = false; return; }
            }
            useRecording = e.target.checked;
        });
        document.getElementById("start-btn").addEventListener("click", startSession);
    }

    async function startSession() {
        try {
            const res = await API.post("/api/sessions", { type: "speaking_interview" });
            Store.startSession(res.session_id, "speaking_interview");
            await loadNextQuestion();
        } catch (e) {
            alert("세션 시작 실패: " + (e.error || JSON.stringify(e)));
        }
    }

    async function loadNextQuestion() {
        try {
            const res = await API.get(`/api/next-question?type=speaking_interview&exclude=${Store.getExcludeParam()}`);
            if (!res.ok) { renderDone(); return; }
            currentQuestion = res.question;
            Store.addUsedQuestion(currentQuestion.id);
            renderSpeaking();
        } catch (e) {
            console.error("loadNextQuestion error:", e);
            renderDone();
        }
    }

    async function renderSpeaking() {
        app.innerHTML = `
            ${renderHeader("Speaking Interview")}
            <div class="speaking-screen">
                <div class="interviewer-img">🎓</div>
                <div class="question-number">Question ${Store.usedQuestionIds.length}</div>
                <div id="status-text" class="text-muted">Listening to question...</div>
                <div id="timer-area" class="mt-16"></div>
                <div id="recording-area"></div>
            </div>
            <div class="flex justify-between mt-16">
                <button class="btn btn-secondary" id="skip-btn">건너뛰기</button>
                <button class="btn btn-success hidden" id="start-answer-btn">답변 시작</button>
                <button class="btn btn-danger hidden" id="stop-btn">답변 종료</button>
            </div>
        `;
        bindLogout();

        document.getElementById("skip-btn").addEventListener("click", async () => {
            stopSpeaking();
            if (timerCtrl) timerCtrl.stop();
            if (useRecording) transcript = await recorder.stop();
            showReview();
        });

        document.getElementById("start-answer-btn").addEventListener("click", () => {
            startAnswerPhase();
        });

        document.getElementById("stop-btn").addEventListener("click", async () => {
            if (timerCtrl) timerCtrl.stop();
            if (useRecording) transcript = await recorder.stop();
            showReview();
        });

        // TTS - wait for full audio to finish (no hard timeout for edge-tts)
        try {
            await speak(currentQuestion.prompt_text);
        } catch {}
        onTTSDone();
    }

    function onTTSDone() {
        const statusText = document.getElementById("status-text");
        if (!statusText) return;
        statusText.textContent = "Your turn! Speak now.";
        startAnswerPhase();
    }

    function startAnswerPhase() {
        document.getElementById("start-answer-btn")?.classList.add("hidden");
        document.getElementById("stop-btn")?.classList.remove("hidden");
        document.getElementById("status-text").textContent = "Your turn! Speak now.";

        const timerArea = document.getElementById("timer-area");
        if (!timerArea) return;

        timerCtrl = createTimer(timerArea, RESPONSE_TIME, async () => {
            if (useRecording) transcript = await recorder.stop();
            showReview();
        });
        timerCtrl.start();

        if (useRecording) {
            const recArea = document.getElementById("recording-area");
            if (recArea) {
                recArea.innerHTML = `
                    <div class="recording-indicator">
                        <span class="recording-dot"></span> Recording...
                    </div>
                `;
            }
            recorder.start().catch(() => {});
        }
    }

    function showReview() {
        const elapsed = timerCtrl ? timerCtrl.getElapsed() : 0;
        const audioUrl = recorder.getAudioUrl();

        app.innerHTML = `
            ${renderHeader("Speaking Interview")}
            <div class="review-section">
                <div class="review-question">
                    <strong>Question:</strong><br>${currentQuestion.prompt_text}
                </div>
                ${currentQuestion.template_answer ? `
                    <div class="card">
                        <h3>Template Answer</h3>
                        <p class="mt-8" style="line-height:1.8">${currentQuestion.template_answer}</p>
                    </div>
                ` : ""}
                ${useRecording ? `
                    <div class="card">
                        <h3>My Answer (STT)</h3>
                        <p class="mt-8" style="line-height:1.8">${transcript || "(음성이 인식되지 않았습니다)"}</p>
                        ${audioUrl ? `
                            <div class="mt-8">
                                <audio controls src="${audioUrl}" style="width:100%"></audio>
                            </div>
                        ` : ""}
                    </div>
                ` : ""}
            </div>
            <div class="flex gap-8 mt-16">
                <button class="btn btn-primary flex-1" id="next-btn">다음 문제</button>
                <button class="btn btn-secondary flex-1" id="end-btn">연습 종료</button>
            </div>
        `;
        bindLogout();

        API.post(`/api/sessions/${Store.currentSession.id}/questions`, {
            question_id: currentQuestion.id,
            user_response: transcript || null,
            elapsed_seconds: elapsed,
        }).catch(() => {});

        document.getElementById("next-btn").addEventListener("click", () => {
            transcript = "";
            timerCtrl = null;
            loadNextQuestion();
        });
        document.getElementById("end-btn").addEventListener("click", () => {
            Store.endSession();
            renderMenu();
        });
    }

    function renderDone() {
        app.innerHTML = `
            ${renderHeader("Speaking Interview")}
            <div class="card text-center">
                <h2>모든 문제를 완료했습니다!</h2>
                <p class="text-muted mt-8">문제를 더 추가하려면 문제 관리에서 업로드하세요.</p>
                <button class="btn btn-primary mt-24" onclick="location.hash='#/'">홈으로</button>
            </div>
        `;
        bindLogout();
        Store.endSession();
    }

    renderMenu();
}

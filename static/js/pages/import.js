import API from "../lib/api.js";
import { renderHeader, bindLogout } from "../components/nav.js";

export default function ImportPage(app) {
    let parsedRows = [];
    let filename = "";

    function renderMain() {
        app.innerHTML = `
            ${renderHeader("문제 관리")}
            <div class="import-zone" id="drop-zone">
                <div class="import-zone-icon">📁</div>
                <div class="import-zone-text">
                    Excel(.xlsx) 또는 Word(.docx) 파일을 클릭하여 선택하세요
                </div>
                <input type="file" id="file-input" accept=".xlsx,.docx">
            </div>
            <div class="mt-16">
                <h3>수동 추가</h3>
                <div class="card mt-8">
                    <div class="form-group">
                        <label>유형</label>
                        <select class="form-select" id="manual-type">
                            <option value="speaking_interview">Speaking Interview</option>
                            <option value="writing_email">Writing Email</option>
                            <option value="writing_discussion">Writing Discussion</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>문제 (Question / Prompt)</label>
                        <textarea class="form-textarea" id="manual-prompt" style="min-height:80px" placeholder="문제를 입력하세요..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>템플릿 답변 (Template Answer)</label>
                        <textarea class="form-textarea" id="manual-template" style="min-height:120px" placeholder="모범 답변을 입력하세요..."></textarea>
                    </div>
                    <button class="btn btn-primary btn-block" id="manual-add-btn">추가</button>
                </div>
            </div>
            <div class="mt-24" id="question-list-area"></div>
        `;
        bindLogout();

        const dropZone = document.getElementById("drop-zone");
        const fileInput = document.getElementById("file-input");
        dropZone.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) handleFile(e.target.files[0]);
        });

        document.getElementById("manual-add-btn").addEventListener("click", async () => {
            const type = document.getElementById("manual-type").value;
            const prompt = document.getElementById("manual-prompt").value.trim();
            const template = document.getElementById("manual-template").value.trim();
            if (!prompt) { alert("문제를 입력해주세요."); return; }
            try {
                await API.post("/api/questions", { type, prompt_text: prompt, template_answer: template });
                document.getElementById("manual-prompt").value = "";
                document.getElementById("manual-template").value = "";
                loadQuestionList();
            } catch (e) {
                alert("추가 실패: " + (e.error || ""));
            }
        });

        loadQuestionList();
    }

    async function loadQuestionList() {
        const area = document.getElementById("question-list-area");
        if (!area) return;
        try {
            const qs = await API.get("/api/questions");
            if (!qs.length) {
                area.innerHTML = `<p class="text-muted">등록된 문제가 없습니다.</p>`;
                return;
            }
            const badgeClass = { speaking_interview: "badge-speaking", writing_email: "badge-email", writing_discussion: "badge-discussion" };
            const badgeLabel = { speaking_interview: "Speaking", writing_email: "Email", writing_discussion: "Discussion" };
            area.innerHTML = `
                <h3>등록된 문제 (${qs.length}개)</h3>
                <div class="mt-8">
                    ${qs.map(q => `
                        <div class="card question-item" style="padding:14px">
                            <div class="flex items-center justify-between mb-8">
                                <span class="badge ${badgeClass[q.type] || ''}">${badgeLabel[q.type] || q.type}</span>
                                <div class="flex gap-8">
                                    <button class="btn btn-sm btn-secondary" data-edit="${q.id}">수정</button>
                                    <button class="btn btn-sm btn-danger" data-del="${q.id}">삭제</button>
                                </div>
                            </div>
                            <p style="font-size:0.9rem;margin-bottom:6px"><strong>Q:</strong> ${truncate(q.prompt_text, 150)}</p>
                            ${q.template_answer ? `<p style="font-size:0.85rem;color:var(--text-muted)"><strong>A:</strong> ${truncate(q.template_answer, 100)}</p>` : ''}
                        </div>
                    `).join("")}
                </div>
            `;
            area.querySelectorAll("[data-del]").forEach(btn => {
                btn.addEventListener("click", async () => {
                    if (!confirm("이 문제를 삭제할까요?")) return;
                    await API.del(`/api/questions/${btn.dataset.del}`);
                    loadQuestionList();
                });
            });
            area.querySelectorAll("[data-edit]").forEach(btn => {
                btn.addEventListener("click", () => {
                    renderEditForm(parseInt(btn.dataset.edit));
                });
            });
        } catch {}
    }

    async function renderEditForm(questionId) {
        let q;
        try {
            q = await API.get(`/api/questions/${questionId}`);
        } catch {
            alert("문제를 불러올 수 없습니다.");
            return;
        }

        app.innerHTML = `
            ${renderHeader("문제 수정")}
            <div class="card">
                <div class="form-group">
                    <label>유형</label>
                    <select class="form-select" id="edit-type">
                        <option value="speaking_interview" ${q.type === 'speaking_interview' ? 'selected' : ''}>Speaking Interview</option>
                        <option value="writing_email" ${q.type === 'writing_email' ? 'selected' : ''}>Writing Email</option>
                        <option value="writing_discussion" ${q.type === 'writing_discussion' ? 'selected' : ''}>Writing Discussion</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>주제 (Topic)</label>
                    <input class="form-input" id="edit-topic" value="${escapeAttr(q.topic || '')}" placeholder="주제 (선택)">
                </div>
                <div class="form-group">
                    <label>문제 (Question / Prompt)</label>
                    <textarea class="form-textarea" id="edit-prompt" style="min-height:100px">${escapeHtml(q.prompt_text || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>템플릿 답변 (Template Answer)</label>
                    <textarea class="form-textarea" id="edit-template" style="min-height:160px">${escapeHtml(q.template_answer || '')}</textarea>
                </div>
                <div id="edit-extra-fields"></div>
                <div class="flex gap-8 mt-16">
                    <button class="btn btn-primary flex-1" id="save-btn">저장</button>
                    <button class="btn btn-secondary flex-1" id="cancel-btn">취소</button>
                </div>
            </div>
        `;
        bindLogout();

        // Show extra fields based on type
        function updateExtraFields() {
            const type = document.getElementById("edit-type").value;
            const extra = document.getElementById("edit-extra-fields");
            if (type === "writing_email") {
                extra.innerHTML = `
                    <div class="form-group">
                        <label>Bullet Points (한 줄에 하나씩)</label>
                        <textarea class="form-textarea" id="edit-bullets" style="min-height:80px" placeholder="각 bullet point를 줄바꿈으로 구분">${parseBullets(q.bullet_points)}</textarea>
                    </div>
                `;
            } else if (type === "writing_discussion") {
                extra.innerHTML = `
                    <div class="form-group">
                        <label>Professor Prompt</label>
                        <textarea class="form-textarea" id="edit-prof" style="min-height:80px">${escapeHtml(q.professor_prompt || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Student Response 1</label>
                        <textarea class="form-textarea" id="edit-s1" style="min-height:80px">${escapeHtml(q.student_response_1 || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Student Response 2</label>
                        <textarea class="form-textarea" id="edit-s2" style="min-height:80px">${escapeHtml(q.student_response_2 || '')}</textarea>
                    </div>
                `;
            } else {
                extra.innerHTML = "";
            }
        }

        document.getElementById("edit-type").addEventListener("change", updateExtraFields);
        updateExtraFields();

        document.getElementById("save-btn").addEventListener("click", async () => {
            const type = document.getElementById("edit-type").value;
            const data = {
                type,
                topic: document.getElementById("edit-topic").value.trim() || null,
                prompt_text: document.getElementById("edit-prompt").value.trim(),
                template_answer: document.getElementById("edit-template").value.trim(),
            };
            if (!data.prompt_text) { alert("문제를 입력해주세요."); return; }

            if (type === "writing_email") {
                const bulletsEl = document.getElementById("edit-bullets");
                if (bulletsEl) {
                    const lines = bulletsEl.value.split("\n").map(l => l.trim()).filter(Boolean);
                    data.bullet_points = lines.length ? JSON.stringify(lines) : null;
                }
            } else if (type === "writing_discussion") {
                const profEl = document.getElementById("edit-prof");
                const s1El = document.getElementById("edit-s1");
                const s2El = document.getElementById("edit-s2");
                if (profEl) data.professor_prompt = profEl.value.trim() || null;
                if (s1El) data.student_response_1 = s1El.value.trim() || null;
                if (s2El) data.student_response_2 = s2El.value.trim() || null;
            }

            try {
                await API.put(`/api/questions/${questionId}`, data);
                renderMain();
            } catch (e) {
                alert("수정 실패: " + (e.detail || e.error || e.message || "알 수 없는 오류"));
            }
        });

        document.getElementById("cancel-btn").addEventListener("click", () => renderMain());
    }

    async function handleFile(file) {
        const ext = file.name.split(".").pop().toLowerCase();
        try {
            let res;
            if (ext === "xlsx") {
                res = await API.upload("/api/import/xlsx", file);
            } else if (ext === "docx") {
                res = await API.upload("/api/import/docx", file);
            } else {
                alert("지원하지 않는 파일 형식입니다. (.xlsx 또는 .docx)");
                return;
            }
            parsedRows = res.rows;
            filename = res.filename;
            renderPreview();
        } catch (e) {
            alert("파일 파싱 실패: " + (e.error || e.detail || ""));
        }
    }

    function renderPreview() {
        if (!parsedRows.length) {
            alert("파싱된 문제가 없습니다.");
            renderMain();
            return;
        }

        app.innerHTML = `
            ${renderHeader("문제 미리보기")}
            <p class="text-muted mb-16">파일: ${filename} — ${parsedRows.length}개 문제 감지</p>
            <div class="form-group">
                <label>유형 (전체 적용)</label>
                <select class="form-select" id="bulk-type">
                    <option value="">파일에서 감지</option>
                    <option value="speaking_interview">Speaking Interview</option>
                    <option value="writing_email">Writing Email</option>
                    <option value="writing_discussion">Writing Discussion</option>
                </select>
            </div>
            <div style="overflow-x:auto">
                <table class="preview-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Type</th>
                            <th>Question</th>
                            <th>Template</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parsedRows.map((r, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${r.type || "—"}</td>
                                <td class="cell-truncate">${r.prompt_text || "—"}</td>
                                <td class="cell-truncate">${r.template_answer || "—"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
            <div class="flex gap-8 mt-16">
                <button class="btn btn-primary flex-1" id="confirm-btn">전체 저장</button>
                <button class="btn btn-secondary flex-1" id="cancel-btn">취소</button>
            </div>
        `;
        bindLogout();

        document.getElementById("confirm-btn").addEventListener("click", async () => {
            const bulkType = document.getElementById("bulk-type").value;
            const questions = parsedRows.map(r => ({
                ...r,
                type: bulkType || r.type || "speaking_interview",
            }));
            try {
                const res = await API.post("/api/import/confirm", { questions, filename });
                alert(`${res.count}개 문제가 저장되었습니다.`);
                renderMain();
            } catch (e) {
                alert("저장 실패: " + (e.error || ""));
            }
        });

        document.getElementById("cancel-btn").addEventListener("click", () => {
            parsedRows = [];
            renderMain();
        });
    }

    function truncate(str, max) {
        if (!str) return "";
        return str.length > max ? escapeHtml(str.slice(0, max)) + "..." : escapeHtml(str);
    }

    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function escapeAttr(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }

    function parseBullets(json) {
        if (!json) return "";
        try { return JSON.parse(json).join("\n"); } catch { return ""; }
    }

    renderMain();
}

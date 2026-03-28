import API from "../lib/api.js";
import Store from "../lib/store.js";
import { renderHeader, bindLogout } from "../components/nav.js";

export default function VocabPage(app) {
    let allWords = [];
    let words = []; // filtered for memorize
    let categories = [];
    let currentCategory = null;
    let currentIndex = 0;
    let revealStep = 0;
    let showMastered = false;

    renderMain();

    async function renderMain() {
        try { categories = await API.get("/api/vocab/categories"); } catch { categories = []; }
        let totalCount = 0;
        let masteredCount = 0;
        try {
            allWords = await API.get("/api/vocab");
            totalCount = allWords.length;
            masteredCount = allWords.filter(w => w.mastered).length;
        } catch { allWords = []; }

        app.innerHTML = `
            ${renderHeader("단어장")}
            <div class="mode-selector">
                <button class="mode-btn active" id="tab-memorize">암기 모드</button>
                <button class="mode-btn" id="tab-manage">단어 관리</button>
            </div>
            ${renderCategorySelect()}
            ${totalCount > 0 ? `
                <div class="card mb-8" style="padding:16px">
                    <div class="flex justify-between items-center">
                        <div>
                            <span style="font-size:0.9rem">암기 완료: <strong style="color:var(--success)">${masteredCount}</strong> / ${totalCount}</span>
                        </div>
                        <div class="flex gap-8">
                            <button class="btn btn-sm btn-secondary" id="reset-btn">초기화</button>
                        </div>
                    </div>
                    <div style="margin-top:8px;height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden">
                        <div style="height:100%;width:${totalCount ? (masteredCount/totalCount*100) : 0}%;background:var(--success);border-radius:2px;transition:width 0.3s"></div>
                    </div>
                </div>
                <div class="flex gap-8 mt-8">
                    <button class="btn btn-primary flex-1" id="start-memorize">미암기 단어 시작 (${totalCount - masteredCount})</button>
                    <button class="btn btn-secondary flex-1" id="start-all">전체 시작 (${totalCount})</button>
                </div>
            ` : `<p class="text-muted" style="font-size:0.9rem;margin-top:12px">등록된 단어가 없습니다. 단어 관리에서 추가하세요.</p>`}
        `;
        bindLogout();
        bindTabs();

        document.getElementById("start-memorize")?.addEventListener("click", () => startMemorize(false));
        document.getElementById("start-all")?.addEventListener("click", () => startMemorize(true));
        document.getElementById("reset-btn")?.addEventListener("click", async () => {
            if (!confirm("모든 암기 완료 표시를 초기화하시겠습니까?")) return;
            try {
                await API.post("/api/vocab/reset-mastery", { category: currentCategory || null });
                renderMain();
            } catch {}
        });

        const catSelect = document.getElementById("cat-select");
        if (catSelect) {
            catSelect.addEventListener("change", () => {
                currentCategory = catSelect.value || null;
                renderMain();
            });
        }
    }

    function renderCategorySelect() {
        if (!categories.length) return "";
        return `
            <div class="form-group">
                <label>카테고리 선택</label>
                <select class="form-select" id="cat-select">
                    <option value="">전체 (${categories.reduce((s,c) => s+c.count, 0)}개)</option>
                    ${categories.map(c => `<option value="${c.category}" ${c.category === currentCategory ? 'selected' : ''}>${c.category} (${c.count}개)</option>`).join("")}
                </select>
            </div>
        `;
    }

    function bindTabs() {
        document.getElementById("tab-memorize")?.addEventListener("click", () => renderMain());
        document.getElementById("tab-manage")?.addEventListener("click", () => renderManage());
    }

    async function startMemorize(includeAll) {
        try {
            const url = currentCategory ? `/api/vocab?category=${encodeURIComponent(currentCategory)}` : "/api/vocab";
            allWords = await API.get(url);
        } catch { allWords = []; }

        if (includeAll) {
            words = [...allWords];
        } else {
            words = allWords.filter(w => !w.mastered);
        }
        if (!words.length) { alert("학습할 단어가 없습니다."); return; }
        // Shuffle randomly
        words = words.sort(() => Math.random() - 0.5);
        showMastered = includeAll;
        currentIndex = 0;
        revealStep = 0;
        renderCard();
    }

    function parseSynonyms(w) {
        if (!w.synonyms) return [];
        try {
            const parsed = JSON.parse(w.synonyms);
            if (Array.isArray(parsed)) return parsed;
        } catch {}
        return w.synonyms.split(",").map(s => ({ word: s.trim(), meaning: "" })).filter(s => s.word);
    }

    function renderCard() {
        const w = words[currentIndex];
        const synonyms = parseSynonyms(w);
        const maxStep = synonyms.length ? 2 : 1;

        app.innerHTML = `
            ${renderHeader("단어장 - 암기")}
            <div class="memorize-progress">${currentIndex + 1} / ${words.length}${w.mastered ? ' <span style="color:var(--success)">✓ 암기완료</span>' : ''}</div>
            <div class="vocab-card">
                <div class="vocab-word">${w.word}</div>
                ${w.part_of_speech ? `<div class="vocab-pos">${w.part_of_speech}</div>` : ""}
                <div class="vocab-meaning ${revealStep < 1 ? 'vocab-hidden' : ''}">${w.meaning}</div>
                ${synonyms.length ? `
                    <div class="vocab-synonyms ${revealStep < 2 ? 'vocab-hidden' : ''}">
                        <span class="vocab-syn-label">유사어</span>
                        <div class="vocab-syn-list">
                            ${synonyms.map(s => `
                                <div class="vocab-syn-item">
                                    <span class="vocab-syn-chip">${s.word}</span>
                                    ${s.meaning ? `<span class="vocab-syn-meaning">${s.meaning}</span>` : ""}
                                </div>
                            `).join("")}
                        </div>
                    </div>
                ` : ""}
                ${w.example_sentence ? `
                    <div class="vocab-example ${revealStep < 2 ? 'vocab-hidden' : ''}">"${w.example_sentence}"</div>
                ` : ""}
            </div>
            <div class="flex gap-8 mt-16" style="flex-wrap:wrap">
                <button class="btn btn-secondary flex-1" id="vocab-prev" ${currentIndex === 0 ? 'disabled' : ''}>← 이전</button>
                <button class="btn btn-primary flex-1" id="vocab-reveal">${revealStep === 0 ? '뜻 보기' : revealStep < maxStep ? '유사어 보기' : '다음 →'}</button>
                <button class="btn btn-secondary flex-1" id="vocab-next" ${currentIndex >= words.length - 1 ? 'disabled' : ''}>다음 →</button>
            </div>
            <div class="flex gap-8 mt-8">
                <button class="btn btn-sm ${w.mastered ? 'btn-secondary' : 'btn-success'} flex-1" id="master-btn">${w.mastered ? '암기 취소' : '암기 완료 ✓'}</button>
                <button class="btn btn-sm btn-secondary flex-1" id="vocab-back">돌아가기</button>
            </div>
        `;
        bindLogout();

        document.getElementById("vocab-prev").addEventListener("click", () => {
            if (currentIndex > 0) { currentIndex--; revealStep = 0; renderCard(); }
        });
        document.getElementById("vocab-next").addEventListener("click", () => {
            if (currentIndex < words.length - 1) { currentIndex++; revealStep = 0; renderCard(); }
        });
        document.getElementById("vocab-reveal").addEventListener("click", () => {
            if (revealStep < maxStep) { revealStep++; renderCard(); }
            else {
                if (currentIndex < words.length - 1) { currentIndex++; revealStep = 0; renderCard(); }
                else { renderComplete(); }
            }
        });
        document.getElementById("master-btn").addEventListener("click", async () => {
            const newMastered = !w.mastered;
            try {
                await API.post(`/api/vocab/${w.id}/master`, { mastered: newMastered });
                w.mastered = newMastered ? 1 : 0;
                const orig = allWords.find(aw => aw.id === w.id);
                if (orig) orig.mastered = w.mastered;
                // 암기 완료 시 자동으로 다음 카드
                if (newMastered) {
                    if (currentIndex < words.length - 1) { currentIndex++; revealStep = 0; renderCard(); }
                    else { renderComplete(); }
                } else {
                    renderCard();
                }
            } catch {}
        });
        document.getElementById("vocab-back").addEventListener("click", () => renderMain());

        // Keyboard
        document.onkeydown = (e) => {
            if (e.key === "ArrowLeft" && currentIndex > 0) { currentIndex--; revealStep = 0; renderCard(); }
            else if (e.key === "ArrowRight" && currentIndex < words.length - 1) { currentIndex++; revealStep = 0; renderCard(); }
            else if (e.key === " " || e.key === "Enter") { e.preventDefault(); document.getElementById("vocab-reveal").click(); }
        };

        // Touch swipe
        let startX = 0;
        app.ontouchstart = (e) => { startX = e.touches[0].clientX; };
        app.ontouchend = (e) => {
            const diff = e.changedTouches[0].clientX - startX;
            if (Math.abs(diff) > 60) {
                if (diff > 0 && currentIndex > 0) { currentIndex--; revealStep = 0; renderCard(); }
                else if (diff < 0 && currentIndex < words.length - 1) { currentIndex++; revealStep = 0; renderCard(); }
            }
        };
    }

    function renderComplete() {
        const mastered = words.filter(w => w.mastered).length;
        app.innerHTML = `
            ${renderHeader("단어장")}
            <div class="card text-center">
                <h2>학습 완료!</h2>
                <p class="text-muted mt-8">${words.length}개 단어 중 <strong style="color:var(--success)">${mastered}개</strong> 암기 완료</p>
                <div class="flex gap-8 mt-24" style="flex-wrap:wrap;justify-content:center">
                    <button class="btn btn-primary" id="restart-btn">다시 학습</button>
                    <button class="btn btn-secondary" id="home-btn">돌아가기</button>
                </div>
            </div>
        `;
        bindLogout();
        document.getElementById("restart-btn").addEventListener("click", () => startMemorize(showMastered));
        document.getElementById("home-btn").addEventListener("click", () => renderMain());
    }

    // ========== 단어 관리 ==========
    async function renderManage() {
        try { categories = await API.get("/api/vocab/categories"); } catch { categories = []; }
        try {
            const url = currentCategory ? `/api/vocab?category=${encodeURIComponent(currentCategory)}` : "/api/vocab";
            allWords = await API.get(url);
        } catch { allWords = []; }

        app.innerHTML = `
            ${renderHeader("단어장")}
            <div class="mode-selector">
                <button class="mode-btn" id="tab-memorize2">암기 모드</button>
                <button class="mode-btn active" id="tab-manage2">단어 관리</button>
            </div>
            ${renderCategorySelect()}
            <div class="flex gap-8 mt-8 mb-8" style="flex-wrap:wrap">
                <button class="btn btn-primary btn-sm flex-1" id="add-manual-btn">직접 추가</button>
                <button class="btn btn-secondary btn-sm flex-1" id="add-image-btn">이미지로 추가</button>
                <button class="btn btn-sm flex-1" id="fetch-meanings-btn" style="background:#1a237e;color:#7c4dff">유사어 뜻 검색</button>
            </div>
            <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px">${allWords.length}개 단어</div>
            <div id="word-list">
                ${allWords.map(w => {
                    const syns = parseSynonyms(w);
                    return `
                    <div class="card mb-8" style="padding:14px 18px">
                        <div class="flex justify-between items-center">
                            <div style="flex:1">
                                <strong>${w.word}</strong>
                                ${w.part_of_speech ? `<span class="text-muted" style="font-size:0.8rem;margin-left:6px">(${w.part_of_speech})</span>` : ""}
                                ${w.mastered ? `<span style="color:var(--success);font-size:0.75rem;margin-left:4px">✓</span>` : ""}
                                <div class="text-muted" style="font-size:0.9rem;margin-top:2px">${w.meaning}</div>
                                ${syns.length ? `<div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px">유사어: ${syns.map(s => s.word + (s.meaning ? ` (${s.meaning})` : "")).join(", ")}</div>` : ""}
                            </div>
                            <div class="flex gap-8" style="flex-shrink:0">
                                <button class="btn btn-sm btn-secondary edit-vocab" data-id="${w.id}">수정</button>
                                <button class="btn btn-sm btn-danger del-vocab" data-id="${w.id}">삭제</button>
                            </div>
                        </div>
                    </div>
                `}).join("")}
            </div>
        `;
        bindLogout();

        document.getElementById("tab-memorize2")?.addEventListener("click", () => renderMain());
        document.getElementById("tab-manage2")?.addEventListener("click", () => renderManage());

        const catSelect = document.getElementById("cat-select");
        if (catSelect) catSelect.addEventListener("change", () => { currentCategory = catSelect.value || null; renderManage(); });

        document.getElementById("add-manual-btn").addEventListener("click", () => renderAddForm());
        document.getElementById("add-image-btn").addEventListener("click", () => renderImageUpload());
        document.getElementById("fetch-meanings-btn").addEventListener("click", fetchAllSynonymMeanings);

        document.querySelectorAll(".edit-vocab").forEach(btn => {
            btn.addEventListener("click", () => {
                const w = allWords.find(w => w.id === parseInt(btn.dataset.id));
                if (w) renderEditForm(w);
            });
        });
        document.querySelectorAll(".del-vocab").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("이 단어를 삭제하시겠습니까?")) return;
                try { await API.del(`/api/vocab/${btn.dataset.id}`); renderManage(); } catch {}
            });
        });
    }

    function renderAddForm() {
        app.innerHTML = `
            ${renderHeader("단어 추가")}
            <div class="card">
                <div class="form-group">
                    <label>카테고리</label>
                    <select class="form-select" id="add-category">
                        ${categories.length ? categories.map(c => `<option value="${c.category}" ${c.category === currentCategory ? 'selected' : ''}>${c.category}</option>`).join("") : ""}
                        <option value="__new__" ${!categories.length ? 'selected' : ''}>+ 새 카테고리</option>
                    </select>
                    <input class="form-input ${!categories.length ? '' : 'hidden'} mt-8" id="add-category-new" placeholder="새 카테고리 이름 입력" value="${!categories.length ? 'default' : ''}">
                </div>
                <div class="form-group">
                    <label>단어 (영어)</label>
                    <input class="form-input" id="add-word" placeholder="예: exploit">
                </div>
                <div class="form-group">
                    <label>뜻 (한국어)</label>
                    <input class="form-input" id="add-meaning" placeholder="예: 이용하다, 착취하다">
                </div>
                <div class="form-group">
                    <label>품사</label>
                    <input class="form-input" id="add-pos" placeholder="예: v, n, adj">
                </div>
                <div class="form-group">
                    <label>유사어 (쉼표 구분)</label>
                    <input class="form-input" id="add-synonyms" placeholder="예: utilize, take advantage of">
                    <p class="text-muted" style="font-size:0.75rem;margin-top:4px">저장 시 유사어 한글 뜻을 자동 검색합니다.</p>
                </div>
                <div class="form-group">
                    <label>예문 (선택)</label>
                    <input class="form-input" id="add-example" placeholder="예: They exploit the resources.">
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-primary flex-1" id="save-btn">저장</button>
                    <button class="btn btn-secondary flex-1" id="cancel-btn">취소</button>
                </div>
            </div>
        `;
        bindLogout();

        const addCatSelect = document.getElementById("add-category");
        const addCatNew = document.getElementById("add-category-new");
        addCatSelect.addEventListener("change", () => {
            if (addCatSelect.value === "__new__") { addCatNew.classList.remove("hidden"); addCatNew.focus(); }
            else { addCatNew.classList.add("hidden"); }
        });

        document.getElementById("save-btn").addEventListener("click", async () => {
            const word = document.getElementById("add-word").value.trim();
            const meaning = document.getElementById("add-meaning").value.trim();
            if (!word || !meaning) { alert("단어와 뜻은 필수입니다."); return; }
            let cat = addCatSelect.value;
            if (cat === "__new__") cat = addCatNew.value.trim() || "default";
            const synonymsRaw = document.getElementById("add-synonyms").value.trim();
            const synonymsJson = await buildSynonymsWithMeanings(synonymsRaw);
            try {
                await API.post("/api/vocab", [{
                    word, meaning,
                    category: cat,
                    part_of_speech: document.getElementById("add-pos").value.trim(),
                    synonyms: synonymsJson,
                    example_sentence: document.getElementById("add-example").value.trim(),
                }]);
                renderManage();
            } catch (e) { alert("추가 실패: " + (e.error || "")); }
        });
        document.getElementById("cancel-btn").addEventListener("click", () => renderManage());
    }

    function renderEditForm(w) {
        const syns = parseSynonyms(w);
        const synsText = syns.map(s => s.word).join(", ");

        app.innerHTML = `
            ${renderHeader("단어 수정")}
            <div class="card">
                <div class="form-group">
                    <label>카테고리</label>
                    <input class="form-input" id="edit-category" value="${w.category || 'default'}">
                </div>
                <div class="form-group">
                    <label>단어 (영어)</label>
                    <input class="form-input" id="edit-word" value="${w.word}">
                </div>
                <div class="form-group">
                    <label>뜻 (한국어)</label>
                    <input class="form-input" id="edit-meaning" value="${w.meaning}">
                </div>
                <div class="form-group">
                    <label>품사</label>
                    <input class="form-input" id="edit-pos" value="${w.part_of_speech || ''}">
                </div>
                <div class="form-group">
                    <label>유사어 (쉼표 구분)</label>
                    <input class="form-input" id="edit-synonyms" value="${synsText}">
                    <p class="text-muted" style="font-size:0.75rem;margin-top:4px">저장 시 유사어 뜻을 자동으로 다시 검색합니다.</p>
                </div>
                <div class="form-group">
                    <label>예문</label>
                    <input class="form-input" id="edit-example" value="${w.example_sentence || ''}">
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-primary flex-1" id="save-edit-btn">저장</button>
                    <button class="btn btn-secondary flex-1" id="cancel-edit-btn">취소</button>
                </div>
            </div>
        `;
        bindLogout();

        document.getElementById("save-edit-btn").addEventListener("click", async () => {
            const word = document.getElementById("edit-word").value.trim();
            const meaning = document.getElementById("edit-meaning").value.trim();
            if (!word || !meaning) { alert("단어와 뜻은 필수입니다."); return; }
            const synonymsRaw = document.getElementById("edit-synonyms").value.trim();
            const synonymsJson = await buildSynonymsWithMeanings(synonymsRaw);
            try {
                await API.put(`/api/vocab/${w.id}`, {
                    word, meaning,
                    category: document.getElementById("edit-category").value.trim() || "default",
                    part_of_speech: document.getElementById("edit-pos").value.trim(),
                    synonyms: synonymsJson,
                    example_sentence: document.getElementById("edit-example").value.trim(),
                });
                renderManage();
            } catch (e) { alert("수정 실패: " + (e.error || "")); }
        });
        document.getElementById("cancel-edit-btn").addEventListener("click", () => renderManage());
    }

    async function buildSynonymsWithMeanings(raw) {
        if (!raw) return "";
        const synWords = raw.split(",").map(s => s.trim()).filter(Boolean);
        const result = [];
        for (const sw of synWords) {
            let meaning = "";
            try {
                const res = await API.get(`/api/dictionary/${encodeURIComponent(sw)}`);
                if (res.ok && res.meaning_ko) {
                    meaning = res.meaning_ko;
                }
            } catch {}
            result.push({ word: sw, meaning });
        }
        return JSON.stringify(result);
    }

    async function fetchAllSynonymMeanings() {
        const btn = document.getElementById("fetch-meanings-btn");
        btn.textContent = "검색 중...";
        btn.disabled = true;
        let updated = 0;
        for (const w of allWords) {
            if (!w.synonyms) continue;
            const syns = parseSynonyms(w);
            if (!syns.length) continue;
            const raw = syns.map(s => s.word).join(", ");
            const newJson = await buildSynonymsWithMeanings(raw);
            try {
                await API.put(`/api/vocab/${w.id}`, { synonyms: newJson });
                updated++;
            } catch {}
        }
        btn.textContent = `${updated}개 업데이트 완료`;
        setTimeout(() => renderManage(), 1000);
    }

    // ========== 이미지 업로드 (다중) ==========
    function renderImageUpload() {
        app.innerHTML = `
            ${renderHeader("이미지로 단어 추가")}
            <div class="card">
                <div class="form-group">
                    <label>카테고리</label>
                    <select class="form-select" id="img-category">
                        ${categories.length ? categories.map(c => `<option value="${c.category}" ${c.category === currentCategory ? 'selected' : ''}>${c.category}</option>`).join("") : ""}
                        <option value="__new__" ${!categories.length ? 'selected' : ''}>+ 새 카테고리</option>
                    </select>
                    <input class="form-input ${!categories.length ? '' : 'hidden'} mt-8" id="img-category-new" placeholder="새 카테고리 이름 입력" value="${!categories.length ? 'default' : ''}">
                </div>
                <div class="import-zone" id="img-zone">
                    <div class="import-zone-icon">📷</div>
                    <div class="import-zone-text">이미지 클릭 또는 드래그 (여러 장 선택 가능)</div>
                    <input type="file" accept="image/*" id="img-input" multiple>
                </div>
                <div id="img-status" class="mt-8"></div>
                <div id="ocr-results" class="mt-8"></div>
                <div class="flex gap-8 mt-16">
                    <button class="btn btn-secondary flex-1" id="img-cancel">취소</button>
                </div>
            </div>
        `;
        bindLogout();

        const catSelect = document.getElementById("img-category");
        const catNew = document.getElementById("img-category-new");
        catSelect.addEventListener("change", () => {
            if (catSelect.value === "__new__") { catNew.classList.remove("hidden"); catNew.focus(); }
            else { catNew.classList.add("hidden"); }
        });

        const zone = document.getElementById("img-zone");
        const input = document.getElementById("img-input");
        zone.addEventListener("click", () => input.click());
        zone.addEventListener("dragover", e => { e.preventDefault(); zone.style.borderColor = "var(--accent)"; });
        zone.addEventListener("dragleave", () => { zone.style.borderColor = ""; });
        zone.addEventListener("drop", e => {
            e.preventDefault(); zone.style.borderColor = "";
            if (e.dataTransfer.files.length) handleMultipleImages(Array.from(e.dataTransfer.files));
        });
        input.addEventListener("change", () => {
            if (input.files.length) handleMultipleImages(Array.from(input.files));
        });
        document.getElementById("img-cancel").addEventListener("click", () => renderManage());
    }

    async function handleMultipleImages(files) {
        const statusEl = document.getElementById("img-status");
        const resultsEl = document.getElementById("ocr-results");
        let allOcrWords = [];

        for (let i = 0; i < files.length; i++) {
            statusEl.innerHTML = `<div class="text-muted">이미지 ${i+1}/${files.length} OCR 처리 중...</div>`;
            try {
                const res = await API.upload("/api/vocab/import-image", files[i]);
                if (res.ok && res.words.length) {
                    allOcrWords = allOcrWords.concat(res.words);
                }
            } catch (e) {
                statusEl.innerHTML += `<div style="color:var(--danger);font-size:0.85rem">${files[i].name}: 처리 실패</div>`;
            }
        }

        if (!allOcrWords.length) {
            statusEl.innerHTML = `<div style="color:var(--danger)">인식된 단어가 없습니다. 다른 이미지를 시도하세요.</div>`;
            return;
        }

        statusEl.innerHTML = `<div style="color:var(--success)">${allOcrWords.length}개 단어 인식 완료</div>`;
        renderOcrPreview(allOcrWords);
    }

    function renderOcrPreview(ocrWords) {
        const catSelect = document.getElementById("img-category");
        const catNew = document.getElementById("img-category-new");
        let cat = catSelect?.value || "default";
        if (cat === "__new__") cat = catNew?.value?.trim() || "default";
        const resultsEl = document.getElementById("ocr-results");
        if (!resultsEl) return;

        resultsEl.innerHTML = `
            <h3>${ocrWords.length}개 단어 미리보기</h3>
            ${ocrWords.map((w, i) => `
                <div class="card mb-8 ocr-item" data-idx="${i}" style="padding:12px 16px">
                    <div class="flex justify-between items-center">
                        <div>
                            <strong>${w.word}</strong>
                            ${w.part_of_speech ? `<span class="text-muted" style="font-size:0.8rem"> (${w.part_of_speech})</span>` : ""}
                            <div class="text-muted" style="font-size:0.85rem">${w.meaning || "(뜻 없음)"}</div>
                            ${w.synonyms ? `<div style="font-size:0.8rem;color:var(--text-dim)">유사어: ${w.synonyms}</div>` : ""}
                        </div>
                        <button class="btn btn-sm btn-danger ocr-remove" data-idx="${i}">삭제</button>
                    </div>
                </div>
            `).join("")}
            <div class="flex gap-8 mt-8">
                <button class="btn btn-primary flex-1" id="ocr-save">모두 저장 (유사어 뜻 자동검색)</button>
            </div>
        `;

        // Track remaining
        let remaining = [...ocrWords];
        resultsEl.querySelectorAll(".ocr-remove").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                btn.closest(".ocr-item").style.display = "none";
                remaining[idx] = null;
            });
        });

        document.getElementById("ocr-save")?.addEventListener("click", async () => {
            const toSave = remaining.filter(Boolean).filter(w => w.word && w.meaning);
            if (!toSave.length) { alert("저장할 단어가 없습니다."); return; }

            const saveBtn = document.getElementById("ocr-save");
            saveBtn.textContent = "유사어 뜻 검색 중...";
            saveBtn.disabled = true;

            // Build synonyms with meanings for each word
            for (const w of toSave) {
                if (w.synonyms) {
                    w.synonyms = await buildSynonymsWithMeanings(w.synonyms);
                }
                w.category = cat;
            }

            try {
                await API.post("/api/vocab", toSave);
                alert(`${toSave.length}개 단어가 저장되었습니다!`);
                renderManage();
            } catch (e) { alert("저장 실패: " + (e.error || "")); }
        });
    }
}

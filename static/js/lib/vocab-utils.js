// Shared vocab utilities: localStorage progress, status helpers, pos class, misc.

const PROGRESS_KEY = "vocab_progress_v1";
const LAST_INDEX_KEY = "vocab_last_index";
const SOUND_KEY = "vocab_sound_enabled";
const SWIPE_HINT_KEY = "toeflmate_vocab_swipe_hint_seen";

// Memory fallback when localStorage fails (private mode, etc.)
const memStore = { progress: null, lastIndex: null, sound: null };
let storageOk = true;

function safeGet(key) {
    try { return localStorage.getItem(key); }
    catch { storageOk = false; return null; }
}
function safeSet(key, val) {
    try { localStorage.setItem(key, val); }
    catch { storageOk = false; }
}
function safeRemove(key) {
    try { localStorage.removeItem(key); }
    catch { storageOk = false; }
}

export function isStorageOk() { return storageOk; }

export function loadProgress() {
    if (memStore.progress) return memStore.progress;
    const raw = safeGet(PROGRESS_KEY);
    if (!raw) { memStore.progress = {}; return memStore.progress; }
    try {
        const parsed = JSON.parse(raw);
        memStore.progress = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        memStore.progress = {};
    }
    return memStore.progress;
}

export function saveProgress(p) {
    memStore.progress = p;
    try { safeSet(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}

export function clearProgress() {
    memStore.progress = {};
    safeRemove(PROGRESS_KEY);
}

export function statusOf(progress, wordId) {
    const entry = progress?.[wordId];
    if (!entry) return "unseen";
    return entry.status || "unseen";
}

export function markWord(progress, wordId, status) {
    const now = new Date().toISOString();
    const prev = progress[wordId] || { status: "unseen", knownCount: 0, unknownCount: 0, lastSeen: null };
    const next = {
        status,
        knownCount: prev.knownCount || 0,
        unknownCount: prev.unknownCount || 0,
        lastSeen: now,
    };
    if (status === "known") next.knownCount = (prev.knownCount || 0) + 1;
    if (status === "unknown") next.unknownCount = (prev.unknownCount || 0) + 1;
    progress[wordId] = next;
    saveProgress(progress);
    return next;
}

export function loadLastIndex() {
    const raw = safeGet(LAST_INDEX_KEY);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}
export function saveLastIndex(n) { safeSet(LAST_INDEX_KEY, String(n)); }
export function clearLastIndex() { safeRemove(LAST_INDEX_KEY); }

export function loadSoundEnabled() {
    const raw = safeGet(SOUND_KEY);
    return raw === "1" || raw === "true";
}
export function saveSoundEnabled(on) { safeSet(SOUND_KEY, on ? "1" : "0"); }

export function hasSeenSwipeHint() {
    return safeGet(SWIPE_HINT_KEY) === "1";
}
export function markSwipeHintSeen() { safeSet(SWIPE_HINT_KEY, "1"); }
export function clearSwipeHintSeen() { safeRemove(SWIPE_HINT_KEY); }

export function posClass(pos) {
    if (!pos) return "pos-compound";
    if (pos.includes("/")) return "pos-compound";
    const p = pos.toLowerCase().replace(/\./g, "").trim();
    if (p === "n") return "pos-noun";
    if (p === "v") return "pos-verb";
    if (p === "adj") return "pos-adj";
    if (p === "adv") return "pos-adv";
    if (p === "phr") return "pos-phrase";
    if (p === "conj") return "pos-conj";
    return "pos-compound";
}

export function escapeHtml(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

// SRS queue builder — returns a reordered list of word objects (not indexes)
export function buildQueue(words, progress, mode) {
    const byId = (w) => progress[w.id];

    if (mode === "unknown") {
        return words
            .filter((w) => byId(w)?.status === "unknown")
            .slice()
            .sort((a, b) => (byId(a)?.lastSeen || "").localeCompare(byId(b)?.lastSeen || ""));
    }

    const tier1 = words
        .filter((w) => byId(w)?.status === "unknown")
        .slice()
        .sort((a, b) => {
            const ca = byId(a)?.unknownCount || 0;
            const cb = byId(b)?.unknownCount || 0;
            if (cb !== ca) return cb - ca;
            return (byId(a)?.lastSeen || "").localeCompare(byId(b)?.lastSeen || "");
        });

    const tier2 = words.filter((w) => {
        const s = byId(w)?.status;
        return !s || s === "unseen";
    });

    const tier3Raw = words.filter((w) => byId(w)?.status === "known").slice();
    tier3Raw.sort((a, b) => {
        const ka = byId(a)?.knownCount || 0;
        const kb = byId(b)?.knownCount || 0;
        if (ka !== kb) return ka - kb;
        return (byId(a)?.lastSeen || "").localeCompare(byId(b)?.lastSeen || "");
    });
    // Shuffle within same knownCount
    const tier3 = [];
    let i = 0;
    while (i < tier3Raw.length) {
        let j = i + 1;
        while (j < tier3Raw.length && (byId(tier3Raw[j])?.knownCount || 0) === (byId(tier3Raw[i])?.knownCount || 0)) j++;
        const group = tier3Raw.slice(i, j);
        for (let k = group.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1));
            [group[k], group[r]] = [group[r], group[k]];
        }
        tier3.push(...group);
        i = j;
    }

    return [...tier1, ...tier2, ...tier3];
}

export function showToast(msg, duration = 2000) {
    let el = document.getElementById("vocab-toast");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "vocab-toast";
    el.className = "vocab-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, duration);
}

export function playSound(kind) {
    if (!loadSoundEnabled()) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const play = (freq, dur, delay = 0) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = "sine";
            const t0 = ctx.currentTime + delay;
            gain.gain.setValueAtTime(0.12, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            osc.start(t0); osc.stop(t0 + dur);
        };
        if (kind === "known") play(880, 0.15);
        else if (kind === "unknown") play(220, 0.2);
        else if (kind === "complete") {
            play(523.25, 0.18, 0);
            play(659.25, 0.18, 0.15);
            play(783.99, 0.28, 0.3);
        }
    } catch {}
}

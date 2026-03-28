// Neural TTS via edge-tts server endpoint, with Web Speech API fallback

let currentAudio = null;

async function speakWithServer(text) {
    const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
    });
    if (!resp.ok) throw new Error("TTS server error");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve) => {
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => { currentAudio = null; URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { currentAudio = null; URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => resolve());
    });
}

// Fallback: Web Speech API
function getBestVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    const preferred = [
        "Samantha", "Karen", "Daniel", "Google US English", "Google UK English Female",
        "Microsoft Aria", "Microsoft Jenny", "Alex", "Fiona", "Moira",
    ];
    for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name));
        if (v) return v;
    }
    const enUS = voices.find(v => v.lang === "en-US");
    if (enUS) return enUS;
    return voices.find(v => v.lang.startsWith("en")) || null;
}

if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

function speakWithBrowser(text) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) { resolve(); return; }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = "en-US";
        utt.rate = 0.92;
        utt.pitch = 1.0;
        const voice = getBestVoice();
        if (voice) utt.voice = voice;
        utt.onend = resolve;
        utt.onerror = resolve;
        window.speechSynthesis.speak(utt);
    });
}

export async function speak(text) {
    try {
        await speakWithServer(text);
    } catch {
        // Fallback to browser TTS
        await speakWithBrowser(text);
    }
}

export function stopSpeaking() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
}

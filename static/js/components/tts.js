export function speak(text) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) { resolve(); return; }
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = "en-US";
        utt.rate = 0.9;
        utt.onend = resolve;
        utt.onerror = resolve;
        window.speechSynthesis.speak(utt);
    });
}

export function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
}

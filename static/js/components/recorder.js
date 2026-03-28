export function createRecorder() {
    let mediaRecorder = null;
    let recognition = null;
    let transcript = "";
    let stream = null;

    async function start() {
        transcript = "";

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
        } catch (e) {
            console.warn("Microphone not available:", e);
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = "en-US";
            recognition.onresult = (e) => {
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) {
                        transcript += e.results[i][0].transcript + " ";
                    }
                }
            };
            recognition.onerror = () => {};
            recognition.start();
        }
    }

    function stop() {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        return transcript.trim();
    }

    function isAvailable() {
        return !!(navigator.mediaDevices?.getUserMedia &&
            (window.SpeechRecognition || window.webkitSpeechRecognition));
    }

    return { start, stop, isAvailable, getTranscript: () => transcript.trim() };
}

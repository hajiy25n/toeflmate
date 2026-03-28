export function createRecorder() {
    let mediaRecorder = null;
    let recognition = null;
    let transcript = "";
    let stream = null;
    let audioChunks = [];
    let audioUrl = null;

    async function requestMicPermission() {
        try {
            const result = await navigator.permissions.query({ name: "microphone" });
            if (result.state === "denied") {
                alert("마이크 권한이 차단되어 있습니다.\n브라우저 설정에서 마이크 권한을 허용해주세요.");
                return false;
            }
        } catch {}
        // Try getting stream to trigger browser permission prompt
        try {
            const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            testStream.getTracks().forEach(t => t.stop());
            return true;
        } catch (e) {
            if (e.name === "NotAllowedError") {
                alert("마이크 사용을 허용해야 녹음 및 STT 기능을 사용할 수 있습니다.\n다시 시도하려면 녹음 옵션을 다시 켜주세요.");
            } else {
                alert("마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.");
            }
            return false;
        }
    }

    async function start() {
        transcript = "";
        audioChunks = [];
        if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
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
        // Create audio URL for playback
        if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: "audio/webm" });
            audioUrl = URL.createObjectURL(blob);
        }
        return transcript.trim();
    }

    function getAudioUrl() {
        return audioUrl;
    }

    function isAvailable() {
        return !!(navigator.mediaDevices?.getUserMedia &&
            (window.SpeechRecognition || window.webkitSpeechRecognition));
    }

    return { start, stop, isAvailable, requestMicPermission, getTranscript: () => transcript.trim(), getAudioUrl };
}

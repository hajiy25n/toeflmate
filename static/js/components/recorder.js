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

        // Start microphone recording
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

        // Start speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true; // Capture interim results too
            recognition.lang = "en-US";
            recognition.onresult = (e) => {
                // Rebuild full transcript from all results
                let full = "";
                for (let i = 0; i < e.results.length; i++) {
                    full += e.results[i][0].transcript + " ";
                }
                transcript = full;
            };
            recognition.onerror = (e) => {
                console.warn("STT error:", e.error);
                // Restart on non-fatal errors
                if (e.error === "no-speech" || e.error === "aborted") {
                    try { recognition?.start(); } catch {}
                }
            };
            recognition.onend = () => {
                // Auto-restart if still recording (continuous mode can stop unexpectedly)
                if (stream && recognition) {
                    try { recognition.start(); } catch {}
                }
            };
            try {
                recognition.start();
            } catch (e) {
                console.warn("STT start error:", e);
            }
        }
    }

    async function stop() {
        // Stop recognition first and wait briefly for final results
        const recog = recognition;
        recognition = null; // Prevent auto-restart in onend
        if (recog) {
            try { recog.stop(); } catch {}
        }

        // Wait a moment for final STT results to arrive
        await new Promise(r => setTimeout(r, 500));

        // Stop media recorder
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
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

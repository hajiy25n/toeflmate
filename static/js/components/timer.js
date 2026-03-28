export function createTimer(container, totalSeconds, onEnd) {
    const size = 140;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    container.innerHTML = `
        <div class="timer-display">
            <div class="timer-ring">
                <svg width="${size}" height="${size}">
                    <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${radius}" />
                    <circle class="progress" cx="${size / 2}" cy="${size / 2}" r="${radius}"
                        stroke-dasharray="${circumference}" stroke-dashoffset="0" />
                </svg>
                <span class="timer-text"></span>
            </div>
        </div>
    `;

    const progressEl = container.querySelector(".progress");
    const textEl = container.querySelector(".timer-text");
    let remaining = totalSeconds;
    let interval = null;

    function update() {
        const pct = remaining / totalSeconds;
        progressEl.style.strokeDashoffset = circumference * (1 - pct);
        progressEl.classList.remove("warning", "danger");
        if (pct < 0.25) progressEl.classList.add("danger");
        else if (pct < 0.5) progressEl.classList.add("warning");

        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        textEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function start() {
        update();
        interval = setInterval(() => {
            remaining--;
            update();
            if (remaining <= 0) {
                clearInterval(interval);
                interval = null;
                if (onEnd) onEnd();
            }
        }, 1000);
    }

    function stop() {
        if (interval) { clearInterval(interval); interval = null; }
    }

    function getElapsed() {
        return totalSeconds - remaining;
    }

    return { start, stop, getElapsed };
}

export function createInlineTimer(totalSeconds, onEnd) {
    const el = document.createElement("span");
    el.className = "timer-inline";
    let remaining = totalSeconds;
    let interval = null;

    function update() {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        el.classList.remove("warning", "danger");
        const pct = remaining / totalSeconds;
        if (pct < 0.25) el.classList.add("danger");
        else if (pct < 0.5) el.classList.add("warning");
    }

    function start() {
        update();
        interval = setInterval(() => {
            remaining--;
            update();
            if (remaining <= 0) {
                clearInterval(interval);
                interval = null;
                if (onEnd) onEnd();
            }
        }, 1000);
    }

    function stop() {
        if (interval) { clearInterval(interval); interval = null; }
    }

    function getElapsed() {
        return totalSeconds - remaining;
    }

    return { el, start, stop, getElapsed };
}

// Count-up timer (elapsed time display)
export function createElapsedTimer() {
    const el = document.createElement("span");
    el.className = "timer-inline";
    let elapsed = 0;
    let interval = null;

    function update() {
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function start() {
        update();
        interval = setInterval(() => {
            elapsed++;
            update();
        }, 1000);
    }

    function stop() {
        if (interval) { clearInterval(interval); interval = null; }
    }

    function getElapsed() {
        return elapsed;
    }

    return { el, start, stop, getElapsed };
}

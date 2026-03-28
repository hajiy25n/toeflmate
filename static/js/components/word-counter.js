export function countWords(text) {
    if (!text || !text.trim()) return 0;
    return text.trim()
        .split(/\s+/)
        .filter(token => token.length > 0 && !/^[^\w]+$/.test(token))
        .length;
}

export function attachWordCounter(textarea, displayEl) {
    function update() {
        const count = countWords(textarea.value);
        displayEl.innerHTML = `Words: <strong>${count}</strong>`;
    }
    textarea.addEventListener("input", update);
    update();
    return { getCount: () => countWords(textarea.value) };
}

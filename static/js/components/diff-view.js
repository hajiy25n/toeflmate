export function renderDiff(container, userText, templateText) {
    const dmp = new diff_match_patch();

    const diffs = dmp.diff_main(templateText, userText);
    dmp.diff_cleanupSemantic(diffs);

    let userHtml = "";
    let templateHtml = "";

    for (const [op, text] of diffs) {
        const escaped = escapeHtml(text);
        if (op === 0) {
            userHtml += escaped;
            templateHtml += escaped;
        } else if (op === 1) {
            userHtml += `<span class="diff-added">${escaped}</span>`;
        } else if (op === -1) {
            templateHtml += `<span class="diff-removed">${escaped}</span>`;
        }
    }

    container.innerHTML = `
        <div class="diff-container">
            <div class="diff-panel">
                <div class="diff-panel-title">My Answer</div>
                <div class="content">${userHtml}</div>
            </div>
            <div class="diff-panel">
                <div class="diff-panel-title">Template</div>
                <div class="content">${templateHtml}</div>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;")
              .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

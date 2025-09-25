// utils.js - Utility functions for progress and UI management

export function updateProgress(progressBar, percent) {
    progressBar.style.width = `${percent}%`;
}

export function resetUI(loading, progressContainer) {
    setTimeout(() => {
        loading.style.display = "none";
        progressContainer.style.display = "none";
    }, 1500);
}

export function findFunctionEnd(scriptContent, startIndex) {
    let braceCount = 0;
    let i = startIndex;
    while (i < scriptContent.length) {
        if (scriptContent[i] === '{') braceCount++;
        else if (scriptContent[i] === '}') braceCount--;
        if (braceCount === 0) return i + 1;
        i++;
    }
    return scriptContent.length;
}
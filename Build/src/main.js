import { updateProgress, resetUI } from './utils.js';
import { parseHTML } from './htmlParser.js';
import { renderGraph } from './graphRenderer.js';

const fileInput = document.getElementById('fileInput');
const loading = document.getElementById('loading');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');

fileInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) {
        loading.innerText = "No file selected!";
        resetUI(loading, progressContainer);
        return;
    }

    if (!file.name.endsWith('.html')) {
        loading.innerText = "Please upload an HTML file!";
        resetUI(loading, progressContainer);
        return;
    }

    loading.style.display = "block";
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            parseHTML(e.target.result, progressBar, loading, progressContainer, resetUI, renderGraph);
            fileInput.value = ''; // Reset file input
        } catch (error) {
            loading.innerText = `Error processing file: ${error.message}`;
            resetUI(loading, progressContainer);
        }
    };
    reader.onerror = () => {
        loading.innerText = "Error reading file!";
        resetUI(loading, progressContainer);
    };
    reader.readAsText(file);
});
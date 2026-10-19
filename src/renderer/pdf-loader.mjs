// pdf.js (Apache-2.0) for text-layer extraction and page rendering. Scripting is never enabled.
import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
window.pdfjsLib = pdfjsLib;
window.dispatchEvent(new Event('pdfjs-ready'));

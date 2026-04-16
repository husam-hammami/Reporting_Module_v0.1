import { toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';

/**
 * Temporarily switch the page to light mode so CSS variables resolve to dark-on-white
 * values. Returns a cleanup function that restores the original mode.
 */
function forceLightMode() {
  const html = document.documentElement;
  const wasDark = html.classList.contains('dark');
  if (wasDark) html.classList.remove('dark');
  return () => { if (wasDark) html.classList.add('dark'); };
}

/**
 * Force every Chart.js instance inside `root` to paint synchronously.
 */
function syncChartJsCanvases(root) {
  if (!root?.querySelectorAll) return;
  const ChartCtor = window.Chart;
  const getChart = ChartCtor?.getChart;
  if (typeof getChart !== 'function') return;

  for (const cvs of root.querySelectorAll('canvas')) {
    try {
      const chart = getChart(cvs);
      if (chart) {
        chart.stop?.();
        chart.resize?.();
        chart.update('none');
      }
    } catch { /* ignore */ }
  }
}

/**
 * Wait for layout, fonts, and chart paints to settle.
 */
async function settle(element) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  syncChartJsCanvases(element);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }

  await new Promise((r) => setTimeout(r, 500));
}

/**
 * Core capture: switch to light mode, wait, snapshot via html-to-image, restore.
 * html-to-image uses SVG foreignObject — the browser's own rendering engine paints
 * the DOM, so CSS variables, flexbox, SVG, and canvas elements all render correctly.
 */
export async function captureElement(element) {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  const restoreDarkMode = forceLightMode();

  await settle(element);

  let canvas;
  try {
    canvas = await toCanvas(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      skipAutoScale: true,
      includeQueryParams: true,
      cacheBust: true,
      filter: (node) => {
        if (node.classList?.contains?.('print:hidden')) return false;
        if (node.tagName === 'NOSCRIPT') return false;
        return true;
      },
    });
  } finally {
    restoreDarkMode();
    element.style.backgroundColor = originalBg;
  }

  return canvas;
}

export async function exportAsPNG(element, filename = 'report') {
  const canvas = await captureElement(element);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

const PDF_MARGIN_X = 12;
const PDF_MARGIN_TOP = 10;
const PDF_FOOTER_H = 8;

function pdfLayoutDims(orientation, pageMode) {
  let orient = orientation || 'auto';
  if (orient === 'auto') {
    orient = (pageMode || 'a4') === 'a4' ? 'portrait' : 'landscape';
  }
  const pdf = new jsPDF(orient, 'mm', 'a4');
  return {
    orientation: orient,
    pdfWidth: pdf.internal.pageSize.getWidth(),
    pdfHeight: pdf.internal.pageSize.getHeight(),
  };
}

/** How many PDF pages one tall canvas needs (vertical slice). */
export function countPdfSlicesForCanvas(canvas, pdfWidth, pdfHeight) {
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const scaledWidth = pdfWidth - 2 * PDF_MARGIN_X;
  const scaledHeight = (imgHeight / imgWidth) * scaledWidth;
  const contentHeight = pdfHeight - PDF_MARGIN_TOP - PDF_FOOTER_H;
  return Math.max(1, Math.ceil(scaledHeight / contentHeight));
}

/**
 * Append vertical slices of `canvas` to `pdf`. Updates `globalPage` (1-based) and uses `totalPages` in footers.
 * @returns {number} number of PDF pages added
 */
export function appendCanvasSlicesToPdf(pdf, canvas, {
  pdfWidth,
  pdfHeight,
  globalPageRef,
  totalPages,
}) {
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const scaledWidth = pdfWidth - 2 * PDF_MARGIN_X;
  const scaledHeight = (imgHeight / imgWidth) * scaledWidth;
  const contentHeight = pdfHeight - PDF_MARGIN_TOP - PDF_FOOTER_H;
  const sliceCount = Math.max(1, Math.ceil(scaledHeight / contentHeight));

  let added = 0;
  for (let page = 0; page < sliceCount; page++) {
    if (globalPageRef.value > 1 || page > 0) pdf.addPage();

    const srcY = (page * contentHeight / scaledHeight) * imgHeight;
    const srcH = Math.min((contentHeight / scaledHeight) * imgHeight, imgHeight - srcY);

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = imgWidth;
    pageCanvas.height = Math.ceil(srcH);
    const ctx = pageCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);

    const pageImgData = pageCanvas.toDataURL('image/png');
    const sliceScaledHeight = (srcH / imgWidth) * scaledWidth;

    pdf.addImage(pageImgData, 'PNG', PDF_MARGIN_X, PDF_MARGIN_TOP, scaledWidth, sliceScaledHeight);

    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Page ${globalPageRef.value} of ${totalPages}`,
      pdfWidth / 2,
      pdfHeight - 4,
      { align: 'center' },
    );

    if (globalPageRef.value === 1) {
      pdf.text(
        new Date().toLocaleString(),
        pdfWidth - PDF_MARGIN_X,
        pdfHeight - 4,
        { align: 'right' },
      );
    }

    globalPageRef.value += 1;
    added += 1;
  }
  return added;
}

/**
 * Build a multi-page PDF from several raster captures (e.g. one per dashboard tab).
 */
export async function exportAsPDFFromCanvases(canvases, filename = 'report', options = {}) {
  if (!Array.isArray(canvases) || canvases.length === 0) return;

  const { pdfWidth, pdfHeight, orientation } = pdfLayoutDims(options.orientation, options.pageMode);
  const totalPages = canvases.reduce(
    (sum, c) => sum + countPdfSlicesForCanvas(c, pdfWidth, pdfHeight),
    0,
  );

  const pdf = new jsPDF(orientation, 'mm', 'a4');
  const globalPageRef = { value: 1 };

  for (const canvas of canvases) {
    appendCanvasSlicesToPdf(pdf, canvas, {
      pdfWidth,
      pdfHeight,
      globalPageRef,
      totalPages,
    });
  }

  pdf.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * Export as multi-page PDF with auto-detected orientation and page numbers.
 */
export async function exportAsPDF(element, filename = 'report', options = {}) {
  const canvas = await captureElement(element);
  await exportAsPDFFromCanvases([canvas], filename, options);
}

/**
 * Open a print dialog with one sheet per canvas (e.g. one per dashboard tab), matching PDF layout.
 */
export function printCanvases(canvases, documentTitle = 'Report') {
  if (!Array.isArray(canvases) || canvases.length === 0) return;

  const w = window.open('', '_blank');
  if (!w) {
    console.warn('[printCanvases] Popup blocked — cannot open print window');
    return;
  }

  const doc = w.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>`);
  doc.close();

  const titleEl = doc.createElement('title');
  titleEl.textContent = String(documentTitle || 'Report');
  doc.head.appendChild(titleEl);

  const style = doc.createElement('style');
  style.textContent = `
    @page { size: A4 portrait; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .rb-print-sheet {
      page-break-after: always;
      break-after: page;
      width: 100%;
      box-sizing: border-box;
    }
    .rb-print-sheet:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
    .rb-print-sheet img {
      display: block;
      width: 100%;
      height: auto;
    }
  `;
  doc.head.appendChild(style);

  const body = doc.body;
  let finished = 0;

  const bump = () => {
    finished += 1;
    if (finished >= canvases.length) {
      w.focus();
      w.print();
    }
  };

  canvases.forEach((canvas) => {
    const section = doc.createElement('section');
    section.className = 'rb-print-sheet';
    const img = doc.createElement('img');
    img.alt = '';
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      bump();
    };
    img.onload = once;
    img.onerror = once;
    img.src = canvas.toDataURL('image/png');
    if (img.complete) once();
    section.appendChild(img);
    body.appendChild(section);
  });
}

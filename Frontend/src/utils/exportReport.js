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
async function captureElement(element) {
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

/**
 * Export as multi-page PDF with auto-detected orientation and page numbers.
 */
export async function exportAsPDF(element, filename = 'report', options = {}) {
  const canvas = await captureElement(element);

  let orientation = options.orientation || 'auto';
  if (orientation === 'auto') {
    const pageMode = options.pageMode || 'a4';
    orientation = pageMode === 'a4' ? 'portrait' : 'landscape';
  }

  const pdf = new jsPDF(orientation, 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const marginX = 12;
  const marginTop = 10;
  const footerHeight = 8;

  const scaledWidth = pdfWidth - 2 * marginX;
  const scaledHeight = (imgHeight / imgWidth) * scaledWidth;
  const contentHeight = pdfHeight - marginTop - footerHeight;
  const totalPages = Math.ceil(scaledHeight / contentHeight);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    const srcY = (page * contentHeight / scaledHeight) * imgHeight;
    const srcH = Math.min((contentHeight / scaledHeight) * imgHeight, imgHeight - srcY);

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = imgWidth;
    pageCanvas.height = Math.ceil(srcH);
    const ctx = pageCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);

    const pageImgData = pageCanvas.toDataURL('image/png');
    const sliceScaledHeight = (srcH / imgWidth) * scaledWidth;

    pdf.addImage(pageImgData, 'PNG', marginX, marginTop, scaledWidth, sliceScaledHeight);

    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Page ${page + 1} of ${totalPages}`,
      pdfWidth / 2,
      pdfHeight - 4,
      { align: 'center' }
    );

    if (page === 0) {
      pdf.text(
        new Date().toLocaleString(),
        pdfWidth - marginX,
        pdfHeight - 4,
        { align: 'right' }
      );
    }
  }

  pdf.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

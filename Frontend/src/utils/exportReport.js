import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Chart } from 'chart.js';

/** Let layout + fonts + canvas charts settle before html2canvas (RGL/transform timing). */
async function waitForCapturePaint() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Force every Chart.js instance under `root` to stop animation and paint once.
 */
function syncChartJsCanvases(root) {
  if (!root?.querySelectorAll || typeof Chart?.getChart !== 'function') return;
  for (const canvas of root.querySelectorAll('canvas')) {
    try {
      const chart = Chart.getChart(canvas);
      if (chart) {
        chart.stop?.();
        chart.resize?.();
        chart.update('none');
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Convert every <canvas> under `root` to a sibling <img> and hide the canvas.
 * html2canvas has persistent issues cloning canvas bitmaps (tainted, stale, WebGL
 * preserveDrawingBuffer=false). Static <img> elements are handled reliably.
 * Returns a cleanup function that restores the original canvases.
 */
function snapshotCanvasesToImages(root) {
  if (!root?.querySelectorAll) return () => {};
  const swaps = [];

  for (const canvas of [...root.querySelectorAll('canvas')]) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const img = document.createElement('img');
      img.src = dataUrl;
      img.width = canvas.width;
      img.height = canvas.height;
      img.style.width = canvas.offsetWidth + 'px';
      img.style.height = canvas.offsetHeight + 'px';
      img.style.display = canvas.style.display || 'block';
      img.style.position = canvas.style.position || '';
      img.style.inset = canvas.style.inset || '';

      const origDisplay = canvas.style.display;
      canvas.style.display = 'none';
      canvas.parentNode.insertBefore(img, canvas);
      swaps.push({ canvas, img, origDisplay });
    } catch {
      /* tainted or empty — leave original */
    }
  }

  return () => {
    for (const { canvas, img, origDisplay } of swaps) {
      canvas.style.display = origDisplay;
      img.remove();
    }
  };
}

/**
 * Force the page into light mode for the duration of capture.
 * Dark mode uses light text colors (CSS variables) which become invisible
 * on the white PDF background. Returns a cleanup function.
 */
function forceLightMode() {
  const html = document.documentElement;
  const wasDark = html.classList.contains('dark');
  if (wasDark) {
    html.classList.remove('dark');
  }
  return () => {
    if (wasDark) {
      html.classList.add('dark');
    }
  };
}

/** Reset any CSS transform on the element before capture, then restore. */
function withResetTransform(element, fn) {
  const scaledEl = element.closest('[style*="transform"]') || element.parentElement;
  const origTransform = scaledEl?.style?.transform || '';
  if (scaledEl && origTransform) {
    scaledEl.style.transform = 'none';
  }
  try {
    return fn();
  } finally {
    if (scaledEl && origTransform) {
      scaledEl.style.transform = origTransform;
    }
  }
}

/** Build html2canvas options. */
function captureOptions(element) {
  const w = Math.max(element.scrollWidth, element.offsetWidth, 1);
  const h = Math.max(element.scrollHeight, element.offsetHeight, 1);
  return {
    scale: 3,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: w,
    windowHeight: h,
    width: w,
    height: h,
  };
}

/**
 * Core capture pipeline shared by PDF and PNG export:
 * 1. Wait for layout/fonts to settle
 * 2. Force Chart.js to finish painting
 * 3. Switch page to light mode (dark text on white background)
 * 4. Replace <canvas> with static <img> snapshots
 * 5. Capture with html2canvas
 * 6. Restore everything
 */
async function captureElement(element) {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  await waitForCapturePaint();

  syncChartJsCanvases(element);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const restoreCanvases = snapshotCanvasesToImages(element);
  const restoreDarkMode = forceLightMode();

  /* Let the browser repaint with light-mode CSS variables and static images */
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 80));

  let canvas;
  try {
    canvas = await withResetTransform(element, () =>
      html2canvas(element, captureOptions(element))
    );
  } finally {
    restoreDarkMode();
    restoreCanvases();
    element.style.backgroundColor = originalBg;
  }

  return canvas;
}

export async function exportAsPNG(element, filename = 'report') {
  const canvas = await captureElement(element);

  canvas.toBlob((blob) => {
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

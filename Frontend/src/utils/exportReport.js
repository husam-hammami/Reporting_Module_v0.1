import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
  /* Extra headroom after capture-mode disables Chart.js / gauge animations and uPlot resizes */
  await new Promise((r) => setTimeout(r, 220));
}

/**
 * Reset any CSS transform on the element before capture, then restore.
 * This ensures html2canvas captures at true 1:1 scale regardless of zoom.
 */
function withResetTransform(element, fn) {
  // Walk up and find any scaled container
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

export async function exportAsPNG(element, filename = 'report') {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  await waitForCapturePaint();

  const canvas = await withResetTransform(element, () =>
    html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: Math.max(element.scrollWidth, element.offsetWidth),
      width: Math.max(element.scrollWidth, element.offsetWidth),
    })
  );

  element.style.backgroundColor = originalBg;

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
 * @param {HTMLElement} element - The report container to capture
 * @param {string} filename - Base filename (without extension)
 * @param {object} options - { orientation: 'portrait'|'landscape'|'auto', pageMode: 'a4'|'full' }
 */
export async function exportAsPDF(element, filename = 'report', options = {}) {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  await waitForCapturePaint();

  const canvas = await withResetTransform(element, () =>
    html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      // Ensure full scroll width is captured (prevents wide table clipping)
      windowWidth: Math.max(element.scrollWidth, element.offsetWidth),
      width: Math.max(element.scrollWidth, element.offsetWidth),
    })
  );

  element.style.backgroundColor = originalBg;

  // Auto-detect orientation: use portrait for A4/narrow content, landscape for wide dashboards
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

  // Use comfortable margins: 12mm sides, 10mm top, leave room for footer
  const marginX = 12;
  const marginTop = 10;
  const footerHeight = 8; // mm reserved for page number footer

  // Scale image to fit page width within margins
  const scaledWidth = pdfWidth - 2 * marginX;
  const scaledHeight = (imgHeight / imgWidth) * scaledWidth;

  // Content area height per page
  const contentHeight = pdfHeight - marginTop - footerHeight;

  // Calculate total pages needed
  const totalPages = Math.ceil(scaledHeight / contentHeight);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    // Calculate which portion of the image to show on this page
    const srcY = (page * contentHeight / scaledHeight) * imgHeight;
    const srcH = Math.min((contentHeight / scaledHeight) * imgHeight, imgHeight - srcY);

    // Create a canvas slice for this page
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = imgWidth;
    pageCanvas.height = Math.ceil(srcH);
    const ctx = pageCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);

    const pageImgData = pageCanvas.toDataURL('image/png');
    const sliceScaledHeight = (srcH / imgWidth) * scaledWidth;

    pdf.addImage(pageImgData, 'PNG', marginX, marginTop, scaledWidth, sliceScaledHeight);

    // Page number footer
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Page ${page + 1} of ${totalPages}`,
      pdfWidth / 2,
      pdfHeight - 4,
      { align: 'center' }
    );

    // Date stamp on first page
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

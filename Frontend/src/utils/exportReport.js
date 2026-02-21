import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportAsPNG(element, filename = 'report') {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

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

export async function exportAsPDF(element, filename = 'report') {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  element.style.backgroundColor = originalBg;

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('landscape', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
  const x = (pdfWidth - imgWidth * ratio) / 2;
  const y = 0;

  pdf.addImage(imgData, 'PNG', x, y, imgWidth * ratio, imgHeight * ratio);
  pdf.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

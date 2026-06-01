import axios from '../API/axios';

/**
 * Parse filename from Content-Disposition (RFC 5987 filename* or filename="").
 */
function filenameFromContentDisposition(cd) {
  if (!cd || typeof cd !== 'string') return null;
  const utf8Match = cd.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quoted = cd.match(/filename="([^"]+)"/i);
  if (quoted) return quoted[1].trim();
  const unquoted = cd.match(/filename=([^;\n]+)/i);
  if (unquoted) return unquoted[1].trim().replace(/^"|"$/g, '');
  return null;
}

async function messageFromErrorBlob(blob) {
  if (!(blob instanceof Blob)) return 'Export failed';
  const text = await blob.text();
  try {
    const j = JSON.parse(text);
    return j.message || j.error || text || 'Export failed';
  } catch {
    return text?.slice(0, 300) || 'Export failed';
  }
}

/**
 * Download report-builder template as .xlsx with Bearer auth (same as Axios).
 * Avoid window.open — full navigation does not send Authorization.
 *
 * @param {string|number} templateId
 * @param {{ from?: string, to?: string, fallbackFilename?: string }} [options]
 */
export async function downloadReportTemplateExcel(templateId, options = {}) {
  const { from = '', to = '', fallbackFilename } = options;
  const params = new URLSearchParams({ format: 'xlsx' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  let res;
  try {
    res = await axios.get(
      `/api/report-builder/templates/${templateId}/export?${params.toString()}`,
      { responseType: 'blob' },
    );
  } catch (e) {
    const err = e?.response;
    if (err?.data instanceof Blob) {
      throw new Error(await messageFromErrorBlob(err.data));
    }
    throw e instanceof Error ? e : new Error(String(e?.message || e || 'Export failed'));
  }

  const ct = res.headers['content-type'] || '';
  if (ct.includes('application/json')) {
    throw new Error(await messageFromErrorBlob(res.data));
  }

  const cd = res.headers['content-disposition'];
  const name = filenameFromContentDisposition(cd)
    || fallbackFilename
    || `report_${templateId}.xlsx`;

  const blob = res.data instanceof Blob
    ? res.data
    : new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

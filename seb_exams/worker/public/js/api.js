export class ApiError extends Error {
  constructor(status, data) {
    super((data && (data.error || (data.errors && data.errors[0]))) || 'HTTP ' + status);
    this.status = status; this.data = data || {};
  }
}
export async function api(path, { method = 'GET', body, noRedirect } = {}) {
  const headers = { 'X-Requested-With': 'seb-exams' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (r.status === 401 && !noRedirect) { location.hash = '#/login'; throw new ApiError(401, { error: 'Not signed in' }); }
  if (!r.ok) throw new ApiError(r.status, typeof data === 'object' ? data : { error: String(data).slice(0, 300) });
  return data;
}
// Images need the CSRF header, which <img src> cannot send, so fetch them and use object URLs.
const imgCache = new Map();
let imgVersion = 0;
export const bumpImages = () => { imgVersion++; };
export function setImg(img, examId, name) {
  const key = `${examId}/${name}/${imgVersion}`;
  if (!imgCache.has(key)) {
    imgCache.set(key, fetch(`/api/exams/${encodeURIComponent(examId)}/images/${encodeURIComponent(name)}`,
      { credentials: 'same-origin', headers: { 'X-Requested-With': 'seb-exams' } })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then((b) => URL.createObjectURL(b)));
  }
  imgCache.get(key).then((u) => { img.src = u; }).catch(() => { img.alt = 'Image "' + name + '" could not be loaded'; });
  return img;
}

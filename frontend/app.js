const API_BASE = '/api/v1';
const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.message || `เกิดข้อผิดพลาด (${response.status})`);
  return payload;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const gamesEl = document.querySelector('#games');
let games = [];

function setStatus(el, text, type = '') { el.textContent = text; el.className = `status ${type}`; }
function formMessage(form, text, type = '') { const el = form.querySelector('.form-status'); el.textContent = text; el.className = `form-status ${type}`; }
function pending(button, yes, original) { button.disabled = yes; button.textContent = yes ? 'กำลังส่ง…' : original; }

function renderGames(items) {
  gamesEl.replaceChildren();
  if (!items.length) { gamesEl.innerHTML = '<p class="status">ไม่พบเกมที่ตรงกับจำนวนผู้เล่น ลองเปลี่ยนเงื่อนไขดูนะ</p>'; return; }
  gamesEl.innerHTML = items.map((g, index) => `<article class="game-card" style="--card-index:${index}"><span class="category">${escapeHtml(g.category_name || 'บอร์ดเกม')}</span><h3>${escapeHtml(g.name)}</h3><p>ผู้เล่น ${escapeHtml(g.min_players)}–${escapeHtml(g.max_players)} คน</p><button type="button" data-detail="${Number(g.id)}">ดูรายละเอียดและรีวิว →</button></article>`).join('');
}
async function loadGames(filters = '') {
  const status = document.querySelector('#games-status');
  setStatus(status, 'กำลังโหลดเกม…'); gamesEl.replaceChildren();
  try { const result = await api(`/boardgames${filters}`); games = result.data; renderGames(games); setStatus(status, `${games.length} เกมบนชั้น`); fillGameChoices(); }
  catch (error) { setStatus(status, `โหลดรายการเกมไม่สำเร็จ: ${error.message}`, 'error'); }
}
function fillGameChoices() {
  const options = games.map((g) => `<option value="${Number(g.id)}">${escapeHtml(g.name)} · ${escapeHtml(g.min_players)}–${escapeHtml(g.max_players)} คน</option>`).join('');
  document.querySelector('#reservation-games').innerHTML = options;
  document.querySelector('#review-game').innerHTML = `<option value="">เลือกเกม</option>${options}`;
}
gamesEl.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-detail]'); if (!button) return;
  button.disabled = true; button.textContent = 'กำลังโหลด…';
  try {
    const result = await api(`/boardgames/${button.dataset.detail}`); const g = result.data;
    const reviews = (g.reviews || []).map((r) => `<li><strong>${escapeHtml(r.reviewer_name)} · ${'★'.repeat(Number(r.rating))}</strong><p>${escapeHtml(r.comment || 'ไม่มีข้อความรีวิว')}</p></li>`).join('') || '<li>ยังไม่มีรีวิว — ลองเป็นคนแรก</li>';
    document.querySelector('#game-dialog-content').innerHTML = `<p class="eyebrow">${escapeHtml(g.category_name)}</p><h2>${escapeHtml(g.name)}</h2><p>รองรับผู้เล่น ${escapeHtml(g.min_players)}–${escapeHtml(g.max_players)} คน</p><h3>รีวิวจากผู้เล่น</h3><ul class="review-list">${reviews}</ul>`;
    document.querySelector('#game-dialog').showModal();
  } catch (error) { setStatus(document.querySelector('#games-status'), `เปิดรายละเอียดไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { button.disabled = false; button.textContent = 'ดูรายละเอียดและรีวิว →'; }
});
document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault(); const n = document.querySelector('#players').value;
  loadGames(n ? `?minPlayers=${encodeURIComponent(n)}&maxPlayers=${encodeURIComponent(n)}` : '');
});
document.querySelector('#clear-search').addEventListener('click', () => { document.querySelector('#players').value = ''; loadGames(); });
document.querySelector('.dialog-close').addEventListener('click', () => document.querySelector('#game-dialog').close());

document.querySelector('#reservation-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const data = new FormData(form); const submit = form.querySelector('button[type=submit]');
  const body = Object.fromEntries(['customer_name', 'customer_phone', 'customer_email', 'reservation_date', 'reservation_time', 'party_size'].map((key) => [key, data.get(key)]));
  body.party_size = Number(body.party_size); body.boardgame_ids = [...form.elements.boardgame_ids.selectedOptions].map((o) => Number(o.value));
  if (body.boardgame_ids.length === 0) { formMessage(form, 'กรุณาเลือกเกมอย่างน้อย 1 เกมก่อนส่งคำขอจอง', 'error'); return; }
  if (body.reservation_date < new Date().toLocaleDateString('sv-SE')) { formMessage(form, 'กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป', 'error'); return; }
  if (body.customer_phone.replace(/\D/g, '').length < 8) { formMessage(form, 'กรุณาตรวจสอบเบอร์โทรศัพท์ (อย่างน้อย 8 หลัก)', 'error'); return; }
  pending(submit, true, 'ส่งคำขอจอง'); formMessage(form, 'กำลังบันทึกการจอง…');
  try { const result = await api('/reservations', { method: 'POST', body: JSON.stringify(body) }); const check = result.holiday_check; formMessage(form, `จองสำเร็จ เลขที่ #${result.data.id} · สถานะรออนุมัติ${check?.checked ? (check.is_holiday ? ' · วันหยุดราชการ' : ' · ตรวจวันหยุดแล้ว') : ' · ตรวจวันหยุดไม่ได้ แต่บันทึกการจองแล้ว'}`, 'success'); form.reset(); }
  catch (error) { formMessage(form, `จองไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(submit, false, 'ส่งคำขอจอง'); }
});

document.querySelector('#review-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const data = new FormData(form); const id = data.get('boardgame_id'); const submit = form.querySelector('button[type=submit]');
  pending(submit, true, 'ส่งรีวิว'); formMessage(form, 'กำลังส่งรีวิว…');
  try { await api(`/boardgames/${encodeURIComponent(id)}/reviews`, { method: 'POST', body: JSON.stringify({ reviewer_name: data.get('reviewer_name').trim(), rating: Number(data.get('rating')), comment: data.get('comment').trim() }) }); formMessage(form, 'ขอบคุณสำหรับรีวิว! เปิดรายละเอียดเกมเพื่อดูรีวิวล่าสุดได้เลย', 'success'); form.reset(); }
  catch (error) { formMessage(form, `ส่งรีวิวไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(submit, false, 'ส่งรีวิว'); }
});

loadGames();

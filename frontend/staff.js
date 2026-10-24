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
const setStatus = (el, text, type = '') => { el.textContent = text; el.className = `status ${type}`; };
const formMessage = (form, text, type = '') => { const el = form.querySelector('.form-status'); el.textContent = text; el.className = `form-status ${type}`; };
const pending = (button, yes, original) => { button.disabled = yes; button.textContent = yes ? 'กำลังบันทึก…' : original; };
document.querySelector('#logout-button').addEventListener('click', async () => {
  try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST' }); } finally { window.location.assign('/staff/login'); }
});
let games = [];
let categories = [];

const statusLabels = { pending: 'รออนุมัติ', confirmed: 'ยืนยันแล้ว', cancelled: 'ยกเลิก' };
async function loadReservations() {
  const status = document.querySelector('#reservations-status'); const list = document.querySelector('#reservations');
  setStatus(status, 'กำลังโหลดรายการจอง…'); list.replaceChildren();
  try {
    const result = await api('/reservations'); const rows = result.data;
    list.innerHTML = rows.length ? rows.map((r) => `<article class="reservation-card"><div><strong>${escapeHtml(r.customer_name)} <span class="badge badge-${escapeHtml(r.status)}">${statusLabels[r.status] || escapeHtml(r.status)}</span></strong><p class="reservation-contact"><span>เลขที่จอง #${Number(r.id)}</span><span>โทร ${escapeHtml(r.customer_phone || 'ไม่ระบุ')}</span></p><p>${escapeHtml(String(r.reservation_date).slice(0, 10))} · ${escapeHtml(String(r.reservation_time).slice(0, 5))} · ${escapeHtml(r.party_size)} คน · ${(r.boardgames || []).map(escapeHtml).join(', ') || 'ไม่ระบุเกม'}</p></div><div class="reservation-actions"><label><span class="visually-hidden">เปลี่ยนสถานะการจอง ${Number(r.id)}</span><select data-reservation="${Number(r.id)}" data-previous="${escapeHtml(r.status)}"><option value="pending" ${r.status === 'pending' ? 'selected' : ''}>รออนุมัติ</option><option value="confirmed" ${r.status === 'confirmed' ? 'selected' : ''}>ยืนยันแล้ว</option><option value="cancelled" ${r.status === 'cancelled' ? 'selected' : ''}>ยกเลิก</option></select></label><button type="button" class="reservation-delete" data-delete-reservation="${Number(r.id)}" aria-label="ลบคำขอจองหมายเลข ${Number(r.id)}">ลบคำขอ</button></div></article>`).join('') : '<p class="status">ยังไม่มีรายการจอง</p>';
    setStatus(status, `${rows.length} รายการจอง`);
  } catch (error) { setStatus(status, `โหลดรายการจองไม่สำเร็จ: ${error.message}`, 'error'); }
}
document.querySelector('#reservations').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-reservation]'); if (!select) return;
  const previous = select.dataset.previous || 'pending'; select.disabled = true;
  setStatus(document.querySelector('#reservations-status'), 'กำลังอัปเดตสถานะการจอง…');
  try {
    await api(`/reservations/${select.dataset.reservation}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
    select.dataset.previous = select.value; setStatus(document.querySelector('#reservations-status'), 'อัปเดตสถานะการจองแล้ว', 'success');
  } catch (error) { setStatus(document.querySelector('#reservations-status'), `อัปเดตไม่สำเร็จ: ${error.message}`, 'error'); select.value = previous; }
  finally { select.disabled = false; }
});
document.querySelector('#reservations').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-reservation]'); if (!button) return;
  const id = button.dataset.deleteReservation;
  if (!window.confirm(`ต้องการลบคำขอจอง #${id} อย่างถาวรหรือไม่?`)) return;
  button.disabled = true; button.textContent = 'กำลังลบ…';
  setStatus(document.querySelector('#reservations-status'), `กำลังลบคำขอจอง #${id}…`);
  try {
    await api(`/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setStatus(document.querySelector('#reservations-status'), `ลบคำขอจอง #${id} แล้ว`, 'success');
    await loadReservations();
  } catch (error) {
    setStatus(document.querySelector('#reservations-status'), `ลบคำขอจองไม่สำเร็จ: ${error.message}`, 'error');
    if (button.isConnected) { button.disabled = false; button.textContent = 'ลบคำขอ'; }
  }
});

async function loadGames() {
  formMessage(document.querySelector('#game-admin-form'), 'กำลังโหลดรายการเกม…');
  try {
    const result = await api('/boardgames'); games = result.data;
    const select = document.querySelector('#edit-game'); const selected = select.value;
    select.innerHTML = `<option value="">เพิ่มเกมใหม่</option>${games.map((g) => `<option value="${Number(g.id)}">${escapeHtml(g.name)}</option>`).join('')}`;
    select.value = selected;
    formMessage(document.querySelector('#game-admin-form'), `โหลดเกมแล้ว ${games.length} รายการ`, 'success');
  } catch (error) { formMessage(document.querySelector('#game-admin-form'), `โหลดเกมไม่สำเร็จ: ${error.message}`, 'error'); }
}
async function loadCategories() {
  formMessage(document.querySelector('#category-admin-form'), 'กำลังโหลดหมวดหมู่…');
  try {
    const result = await api('/categories'); categories = result.data;
    const options = categories.map((c) => `<option value="${Number(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    document.querySelector('#game-category').innerHTML = options;
    const select = document.querySelector('#edit-category'); const selected = select.value;
    select.innerHTML = `<option value="">เพิ่มหมวดหมู่ใหม่</option>${options}`; select.value = selected;
    formMessage(document.querySelector('#category-admin-form'), `โหลดหมวดหมู่แล้ว ${categories.length} รายการ`, 'success');
  } catch (error) { formMessage(document.querySelector('#category-admin-form'), `โหลดหมวดหมู่ไม่สำเร็จ: ${error.message}`, 'error'); }
}

const gameForm = document.querySelector('#game-admin-form');
gameForm.elements.edit_id.addEventListener('change', () => {
  const game = games.find((g) => String(g.id) === gameForm.elements.edit_id.value); const editing = Boolean(game);
  gameForm.elements.name.value = game?.name || '';
  gameForm.elements.min_players.value = game?.min_players || '';
  gameForm.elements.max_players.value = game?.max_players || '';
  gameForm.elements.category_id.value = categories.find((c) => c.name === game?.category_name)?.id || '';
  gameForm.querySelector('button[type=submit]').textContent = editing ? 'เพิ่มเป็นเกมใหม่' : 'เพิ่มเกมใหม่';
  document.querySelector('#update-game').disabled = !editing; document.querySelector('#delete-game').disabled = !editing;
  formMessage(gameForm, '');
});
function gamePayload() {
  return { name: gameForm.elements.name.value.trim(), min_players: Number(gameForm.elements.min_players.value), max_players: Number(gameForm.elements.max_players.value), category_id: Number(gameForm.elements.category_id.value) };
}
gameForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!gameForm.reportValidity()) return; const body = gamePayload();
  if (body.min_players > body.max_players) { formMessage(gameForm, 'จำนวนผู้เล่นสูงสุดต้องไม่น้อยกว่าขั้นต่ำ', 'error'); return; }
  const button = gameForm.querySelector('button[type=submit]'); pending(button, true, 'เพิ่มเกมใหม่'); formMessage(gameForm, 'กำลังเพิ่มเกม…');
  try { await api('/boardgames', { method: 'POST', body: JSON.stringify(body) }); formMessage(gameForm, 'เพิ่มเกมสำเร็จ', 'success'); gameForm.reset(); gameForm.elements.edit_id.dispatchEvent(new Event('change')); await loadGames(); }
  catch (error) { formMessage(gameForm, `เพิ่มเกมไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(button, false, 'เพิ่มเกมใหม่'); }
});
document.querySelector('#update-game').addEventListener('click', async () => {
  if (!gameForm.reportValidity()) return; const id = gameForm.elements.edit_id.value; const body = gamePayload();
  if (body.min_players > body.max_players) { formMessage(gameForm, 'จำนวนผู้เล่นสูงสุดต้องไม่น้อยกว่าขั้นต่ำ', 'error'); return; }
  const button = document.querySelector('#update-game'); pending(button, true, 'บันทึกการแก้ไข');
  formMessage(gameForm, 'กำลังบันทึกการแก้ไขเกม…');
  try { await api(`/boardgames/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); formMessage(gameForm, 'แก้ไขเกมสำเร็จ', 'success'); await loadGames(); }
  catch (error) { formMessage(gameForm, `แก้ไขเกมไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(button, false, 'บันทึกการแก้ไข'); }
});
document.querySelector('#delete-game').addEventListener('click', async () => {
  const id = gameForm.elements.edit_id.value; if (!id || !window.confirm('ลบเกมนี้หรือไม่? รีวิวและเกมที่เลือกในการจองจะถูกลบด้วย')) return;
  const button = document.querySelector('#delete-game'); pending(button, true, 'ลบเกม');
  formMessage(gameForm, 'กำลังลบเกม…');
  try { await api(`/boardgames/${encodeURIComponent(id)}`, { method: 'DELETE' }); formMessage(gameForm, 'ลบเกมแล้ว', 'success'); gameForm.reset(); gameForm.elements.edit_id.dispatchEvent(new Event('change')); await loadGames(); }
  catch (error) { formMessage(gameForm, `ลบเกมไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(button, false, 'ลบเกม'); }
});

const categoryForm = document.querySelector('#category-admin-form');
categoryForm.elements.edit_id.addEventListener('change', () => {
  const category = categories.find((c) => String(c.id) === categoryForm.elements.edit_id.value); const editing = Boolean(category);
  categoryForm.elements.name.value = category?.name || '';
  categoryForm.querySelector('button[type=submit]').textContent = editing ? 'เพิ่มเป็นหมวดหมู่ใหม่' : 'เพิ่มหมวดหมู่';
  document.querySelector('#update-category').disabled = !editing; document.querySelector('#delete-category').disabled = !editing; formMessage(categoryForm, '');
});
categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!categoryForm.reportValidity()) return;
  const button = categoryForm.querySelector('button[type=submit]'); pending(button, true, 'เพิ่มหมวดหมู่');
  formMessage(categoryForm, 'กำลังเพิ่มหมวดหมู่…');
  try { await api('/categories', { method: 'POST', body: JSON.stringify({ name: categoryForm.elements.name.value.trim() }) }); formMessage(categoryForm, 'เพิ่มหมวดหมู่แล้ว', 'success'); categoryForm.reset(); categoryForm.elements.edit_id.dispatchEvent(new Event('change')); await loadCategories(); }
  catch (error) { formMessage(categoryForm, `เพิ่มหมวดหมู่ไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(button, false, 'เพิ่มหมวดหมู่'); }
});
document.querySelector('#update-category').addEventListener('click', async () => {
  if (!categoryForm.reportValidity()) return; const id = categoryForm.elements.edit_id.value; const button = document.querySelector('#update-category'); pending(button, true, 'เปลี่ยนชื่อ');
  formMessage(categoryForm, 'กำลังเปลี่ยนชื่อหมวดหมู่…');
  try { await api(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name: categoryForm.elements.name.value.trim() }) }); formMessage(categoryForm, 'เปลี่ยนชื่อหมวดหมู่แล้ว', 'success'); await loadCategories(); }
  catch (error) { formMessage(categoryForm, `แก้ไขหมวดหมู่ไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(button, false, 'เปลี่ยนชื่อ'); }
});
document.querySelector('#delete-category').addEventListener('click', async () => {
  const id = categoryForm.elements.edit_id.value; if (!id || !window.confirm('ลบหมวดหมู่นี้หรือไม่?')) return;
  const button = document.querySelector('#delete-category'); pending(button, true, 'ลบหมวดหมู่');
  formMessage(categoryForm, 'กำลังลบหมวดหมู่…');
  try { await api(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }); formMessage(categoryForm, 'ลบหมวดหมู่แล้ว', 'success'); categoryForm.reset(); categoryForm.elements.edit_id.dispatchEvent(new Event('change')); await loadCategories(); }
  catch (error) { formMessage(categoryForm, `ลบหมวดหมู่ไม่สำเร็จ: ${error.message}`, 'error'); }
  finally { pending(button, false, 'ลบหมวดหมู่'); }
});

loadReservations();
loadGames();
loadCategories();

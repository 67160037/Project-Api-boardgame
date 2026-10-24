const forms = { login: document.querySelector('#login-form'), signup: document.querySelector('#signup-form') };
document.querySelectorAll('.auth-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.auth-tab').forEach((item) => item.classList.toggle('active', item === tab));
  Object.entries(forms).forEach(([name, form]) => { form.hidden = name !== tab.dataset.panel; });
}));
async function submitAuth(form, endpoint) {
  const status = form.querySelector('.form-status'); const button = form.querySelector('button[type="submit"],button:not([type])'); button.disabled = true; status.textContent = 'กำลังดำเนินการ…'; status.className = 'form-status';
  try {
    const response = await fetch(`/api/v1/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || 'ดำเนินการไม่สำเร็จ');
    status.textContent = result.message; status.className = 'form-status success';
    if (endpoint === 'login' || endpoint === 'signup') window.location.assign('/staff');
  } catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
  finally { button.disabled = false; }
}
forms.login.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(forms.login, 'login'); });
forms.signup.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(forms.signup, 'signup'); });

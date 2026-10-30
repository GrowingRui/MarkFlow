// Accounts: the sign-in dialog, the header account menu and the daily conversion count.
// Conversion never depends on the server: when /api can't be reached, the page converts without limits.

let state = null; // { user: { email } | null, usage: { used, limit } }, or null when the server is unavailable
let mode = 'signin';

const $ = id => document.getElementById(id);

async function api(path, body) {
  const res = await fetch(path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function render() {
  const user = state?.user;
  $('signInBtn').classList.toggle('hidden', !!user);
  $('account').classList.toggle('hidden', !user);
  if (user) {
    $('accountInitial').textContent = user.email[0];
    $('accountEmail').textContent = user.email;
    $('accountMenuEmail').textContent = user.email;
    $('accountBtn').setAttribute('aria-label', `Account: ${user.email}`);
  }
  const quota = $('quotaLine');
  if (!state) return;
  const { used, limit } = state.usage;
  const left = Math.max(0, limit - used);
  const leftText = `${left} of ${limit} conversion${limit === 1 ? '' : 's'} left today`;
  $('accountUsage').textContent = leftText;
  if (user) quota.textContent = `${leftText}.`;
  else quota.innerHTML = `${left === limit ? `${limit} free conversions a day` : `${leftText}`}. <button type="button" class="link font-semibold text-teal" data-open-auth="signup">Sign in for 30</button>`;
}

// Called before converting. Returns a message when today's limit is used up.
export function limitMessage() {
  if (!state || state.usage.used < state.usage.limit) return null;
  return state.user
    ? `You’ve used all ${state.usage.limit} conversions for today. The count resets at midnight UTC.`
    : `You’ve used today’s ${state.usage.limit} free conversions. Sign in to get 30 a day.`;
}

// Conversions left today, or Infinity when the server is unavailable and nothing is counted.
export function conversionsLeft() {
  return state ? Math.max(0, state.usage.limit - state.usage.used) : Infinity;
}

// Called after a successful conversion.
export async function countConversion() {
  if (!state) return;
  try {
    const { data } = await api('/api/usage', {});
    if (data.usage) state.usage = data.usage;
    render();
  } catch { /* offline: the conversion already happened, so there's nothing to undo */ }
}

// Dialog
function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  $('authTitle').textContent = signup ? 'Create your account' : 'Sign in';
  $('authSub').textContent = signup
    ? 'Free, and it raises your limit to 30 conversions a day. Your files still stay in your browser.'
    : 'Welcome back. Your files still stay in your browser; the account only counts conversions.';
  $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('authSwitchText').textContent = signup ? 'Already have an account?' : 'New to MarkFlow?';
  $('authSwitch').textContent = signup ? 'Sign in' : 'Create an account';
  $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  $('authHint').classList.toggle('hidden', !signup);
  showError('');
}

function showError(text) {
  $('authError').textContent = text;
  $('authError').classList.toggle('hidden', !text);
}

function openDialog(next) {
  setMode(next);
  $('authDialog').showModal();
  $('authEmail').focus();
}

function validate() {
  const email = $('authEmail'), password = $('authPassword');
  if (!email.value.trim() || email.validity.typeMismatch) { email.focus(); return 'Enter a valid email address.'; }
  if (!password.value) { password.focus(); return 'Enter your password.'; }
  if (mode === 'signup' && password.value.length < 8) { password.focus(); return 'Use a password of at least 8 characters.'; }
  return '';
}

async function submit(e) {
  e.preventDefault();
  const invalid = validate();
  if (invalid) { showError(invalid); return; }
  const btn = $('authSubmit');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    const { ok, data } = await api(mode === 'signup' ? '/api/signup' : '/api/signin', {
      email: $('authEmail').value, password: $('authPassword').value,
    });
    if (!ok) { showError(data.error ?? 'Couldn’t reach MarkFlow. Check your connection and try again.'); return; }
    state = data;
    render();
    $('authForm').reset();
    $('authDialog').close();
    $('accountBtn').focus();
  } catch {
    showError('Couldn’t reach MarkFlow. Check your connection and try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// Account menu
function initMenu() {
  const btn = $('accountBtn');
  const menu = $('accountMenu');
  const toggle = open => {
    menu.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => {
    const open = !menu.classList.contains('open');
    toggle(open);
    if (open) $('signOutBtn').focus();
  });
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') { toggle(false); btn.focus(); } });
  menu.addEventListener('focusout', e => { if (!$('account').contains(e.relatedTarget)) toggle(false); });
  document.addEventListener('click', e => { if (!$('account').contains(e.target)) toggle(false); });

  $('signOutBtn').addEventListener('click', async () => {
    try {
      const { ok, data } = await api('/api/signout', {});
      if (!ok) return;
      state = data;
      toggle(false);
      render();
      $('signInBtn').focus();
    } catch { /* stay signed in; the menu remains open so the person can try again */ }
  });
}

export async function initAccount() {
  $('signInBtn').addEventListener('click', () => openDialog('signin'));
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open-auth]');
    if (opener) openDialog(opener.dataset.openAuth);
  });
  $('authSwitch').addEventListener('click', () => { setMode(mode === 'signup' ? 'signin' : 'signup'); $('authEmail').focus(); });
  $('authClose').addEventListener('click', () => $('authDialog').close());
  $('authDialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('authForm').addEventListener('submit', submit);
  initMenu();

  try {
    const { ok, data } = await api('/api/me');
    if (ok) { state = data; render(); }
  } catch { /* no server, e.g. a static preview: hide accounts, convert without limits */ }
  if (!state) { $('signInBtn').classList.add('hidden'); $('quotaLine').classList.add('hidden'); }
}

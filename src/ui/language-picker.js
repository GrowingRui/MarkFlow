// Header language menu. A listbox: arrow keys move, Enter or Space picks, Escape closes.
// Hidden in index.html until the page is translated; remove `hidden` from #langPicker to bring it back.
export function initLanguagePicker() {
  const btn = document.getElementById('langBtn');
  const menu = document.getElementById('langMenu');
  const opts = [...menu.querySelectorAll('[role="option"]')];
  let active = 0;
  const setActive = i => {
    active = (i + opts.length) % opts.length;
    opts.forEach((o, j) => o.classList.toggle('active', j === active));
  };
  const open = () => {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    setActive(opts.findIndex(o => o.getAttribute('aria-selected') === 'true'));
    menu.focus();
  };
  const close = (refocus = true) => {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    opts.forEach(o => o.classList.remove('active'));
    if (refocus) btn.focus();
  };
  const choose = i => {
    opts.forEach((o, j) => o.setAttribute('aria-selected', j === i));
    document.getElementById('langCode').textContent = opts[i].dataset.code;
    btn.setAttribute('aria-label', `Language: ${opts[i].textContent.trim()}`);
    close();
  };
  btn.addEventListener('click', () => menu.classList.contains('open') ? close() : open());
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  opts.forEach((o, i) => {
    o.addEventListener('click', () => choose(i));
    o.addEventListener('mousemove', () => setActive(i));
  });
  menu.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('click', e => { if (menu.classList.contains('open') && !document.getElementById('langPicker').contains(e.target)) close(false); });
}

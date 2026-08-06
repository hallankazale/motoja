(() => {
  const $ = (selector) => document.querySelector(selector);
  let installedSheet = null;
  let startY = 0;
  let startOffset = 0;
  let dragging = false;

  const STATES = {
    collapsed: 62,
    middle: 32,
    expanded: 4,
  };

  function setState(sheet, state, animate = true) {
    if (!sheet || !STATES[state]) return;
    sheet.dataset.sheetState = state;
    sheet.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    sheet.style.transform = `translateY(${STATES[state]}dvh)`;
    sheet.setAttribute('aria-expanded', String(state === 'expanded'));
  }

  function nearestState(offsetVh, velocity) {
    if (velocity < -0.35) return offsetVh <= 32 ? 'expanded' : 'middle';
    if (velocity > 0.35) return offsetVh >= 32 ? 'collapsed' : 'middle';
    return Object.entries(STATES).reduce((best, [name, value]) => (
      Math.abs(value - offsetVh) < Math.abs(STATES[best] - offsetVh) ? name : best
    ), 'middle');
  }

  function install() {
    const sheet = $('.driver-bottom-sheet');
    const handle = $('.driver-sheet-handle');
    if (!sheet || !handle || installedSheet === sheet) return;
    installedSheet = sheet;
    sheet.classList.add('is-draggable');
    handle.setAttribute('role', 'button');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Expandir ou recolher painel');
    setState(sheet, 'middle', false);

    let lastY = 0;
    let lastTime = 0;

    const begin = (clientY, target) => {
      if (target.closest('button,input,select,textarea,a,label')) return;
      dragging = true;
      startY = clientY;
      lastY = clientY;
      lastTime = performance.now();
      startOffset = STATES[sheet.dataset.sheetState || 'middle'];
      sheet.classList.add('dragging');
      sheet.style.transition = 'none';
    };

    const move = (clientY) => {
      if (!dragging) return;
      const deltaVh = ((clientY - startY) / window.innerHeight) * 100;
      const offset = Math.min(STATES.collapsed, Math.max(STATES.expanded, startOffset + deltaVh));
      sheet.style.transform = `translateY(${offset}dvh)`;
      lastY = clientY;
      lastTime = performance.now();
    };

    const end = (clientY) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging');
      const now = performance.now();
      const elapsed = Math.max(16, now - lastTime);
      const velocity = (clientY - lastY) / elapsed;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
      const offsetVh = (matrix.m42 / window.innerHeight) * 100;
      setState(sheet, nearestState(offsetVh, velocity));
    };

    handle.addEventListener('pointerdown', (event) => {
      handle.setPointerCapture?.(event.pointerId);
      begin(event.clientY, event.target);
    });
    handle.addEventListener('pointermove', (event) => move(event.clientY));
    handle.addEventListener('pointerup', (event) => end(event.clientY));
    handle.addEventListener('pointercancel', (event) => end(event.clientY));

    handle.addEventListener('click', () => {
      if (dragging) return;
      const current = sheet.dataset.sheetState || 'middle';
      setState(sheet, current === 'expanded' ? 'middle' : 'expanded');
    });

    handle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const current = sheet.dataset.sheetState || 'middle';
        setState(sheet, current === 'expanded' ? 'middle' : 'expanded');
      }
      if (event.key === 'ArrowUp') setState(sheet, 'expanded');
      if (event.key === 'ArrowDown') setState(sheet, 'collapsed');
    });
  }

  const observer = new MutationObserver(install);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', () => setTimeout(install, 100));
  window.addEventListener('resize', () => installedSheet && setState(installedSheet, installedSheet.dataset.sheetState || 'middle', false));
  setTimeout(install, 1000);
})();
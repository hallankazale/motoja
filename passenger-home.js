(() => {
  const $ = (selector) => document.querySelector(selector);
  let sheetState = 'collapsed';
  let startY = 0;
  let dragging = false;
  let moved = false;

  function passengerVisible() {
    const view = $('#passengerView');
    return Boolean(view && !view.classList.contains('hidden'));
  }

  function setSheetState(state) {
    const card = $('#passengerRequestCard');
    if (!card) return;
    sheetState = state;
    card.classList.toggle('passenger-sheet-expanded', state === 'expanded');
    card.classList.toggle('passenger-sheet-collapsed', state === 'collapsed');
    const handle = card.querySelector('.passenger-sheet-handle');
    if (handle) handle.setAttribute('aria-label', state === 'expanded' ? 'Recolher painel de corrida' : 'Expandir painel de corrida');
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
  }

  function ensureHandle() {
    const card = $('#passengerRequestCard');
    if (!card || card.querySelector('.passenger-sheet-handle')) return;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'passenger-sheet-handle';
    handle.setAttribute('aria-label', 'Expandir painel de corrida');
    card.prepend(handle);

    const begin = (clientY) => {
      dragging = true;
      moved = false;
      startY = clientY;
      handle.setPointerCapture?.(event?.pointerId);
    };

    handle.addEventListener('pointerdown', (event) => {
      dragging = true;
      moved = false;
      startY = event.clientY;
      handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      if (Math.abs(event.clientY - startY) > 8) moved = true;
    });

    const finish = (clientY) => {
      if (!dragging) return;
      const delta = clientY - startY;
      dragging = false;
      if (delta < -35) setSheetState('expanded');
      else if (delta > 35) setSheetState('collapsed');
      else if (!moved) setSheetState(sheetState === 'expanded' ? 'collapsed' : 'expanded');
    };

    handle.addEventListener('pointerup', (event) => finish(event.clientY));
    handle.addEventListener('pointercancel', () => { dragging = false; });
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') setSheetState('expanded');
      if (event.key === 'ArrowDown') setSheetState('collapsed');
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setSheetState(sheetState === 'expanded' ? 'collapsed' : 'expanded');
      }
    });

    card.addEventListener('focusin', () => setSheetState('expanded'));
    setSheetState('collapsed');
  }

  function sync() {
    const active = passengerVisible();
    document.body.classList.toggle('passenger-home-active', active);
    if (!active) return;
    ensureHandle();
    const card = $('#passengerRequestCard');
    const activeRide = $('#passengerActiveRide');
    if (card && activeRide && !activeRide.classList.contains('hidden')) {
      card.classList.remove('passenger-sheet-expanded', 'passenger-sheet-collapsed');
    }
  }

  document.addEventListener('click', () => window.setTimeout(sync, 120));
  document.addEventListener('change', () => window.setTimeout(sync, 120));
  window.addEventListener('resize', () => window.setTimeout(sync, 100));
  window.setInterval(sync, 1200);
  window.setTimeout(sync, 500);
})();

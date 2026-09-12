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
    if (handle) {
      handle.setAttribute('aria-expanded', String(state === 'expanded'));
      handle.setAttribute('aria-label', state === 'expanded' ? 'Recolher painel de corrida' : 'Expandir painel de corrida');
    }
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 280);
  }

  function prepareContent() {
    const card = $('#passengerRequestCard');
    if (!card) return;
    const title = card.querySelector('h2');
    if (title && title.dataset.motojaTitleReady !== 'true') {
      title.textContent = 'Para onde você vai?';
      title.dataset.motojaTitleReady = 'true';
    }
    const requestButton = $('#requestRideButton');
    if (requestButton && requestButton.dataset.motojaLabelReady !== 'true') {
      requestButton.textContent = 'Chamar MotoJá';
      requestButton.dataset.motojaLabelReady = 'true';
    }
  }

  function ensureHandle() {
    const card = $('#passengerRequestCard');
    if (!card) return;
    let handle = card.querySelector('.passenger-sheet-handle');
    if (!handle) {
      handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'passenger-sheet-handle';
      card.prepend(handle);
    }
    if (handle.dataset.motojaBound === 'true') return;
    handle.dataset.motojaBound = 'true';

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
      if (delta < -32) setSheetState('expanded');
      else if (delta > 32) setSheetState('collapsed');
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
    prepareContent();
    ensureHandle();
    const card = $('#passengerRequestCard');
    const activeRide = $('#passengerActiveRide');
    if (card && activeRide && !activeRide.classList.contains('hidden')) {
      card.classList.remove('passenger-sheet-expanded', 'passenger-sheet-collapsed');
    }
  }

  document.addEventListener('click', () => window.setTimeout(sync, 100));
  document.addEventListener('change', () => window.setTimeout(sync, 100));
  window.addEventListener('resize', () => window.setTimeout(sync, 80));
  window.setInterval(sync, 1000);
  window.setTimeout(sync, 450);
})();

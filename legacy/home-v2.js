(() => {
  const $ = (selector) => document.querySelector(selector);

  function buildTopActions() {
    const topbar = $('.topbar');
    if (!topbar || $('.mj-top-actions')) return;
    const logout = $('#logoutButton');
    const actions = document.createElement('div');
    actions.className = 'mj-top-actions';
    actions.innerHTML = `
      <button type="button" class="mj-top-action" id="mjNotifications" aria-label="Notificações">◉</button>
      <button type="button" class="mj-top-action" id="mjProfile" aria-label="Perfil">⌁</button>`;
    if (logout) actions.appendChild(logout);
    topbar.appendChild(actions);
  }

  function buildBottomNav() {
    if ($('.mj-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'mj-bottom-nav hidden';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.innerHTML = `
      <button type="button" data-home-mode="passenger"><span>⌖</span><span>Corrida</span></button>
      <button type="button" data-home-mode="driver"><span>◈</span><span>Motociclista</span></button>
      <button type="button" data-home-mode="admin"><span>▦</span><span>Painel</span></button>
      <button type="button" id="mjMore"><span>☰</span><span>Mais</span></button>`;
    document.body.appendChild(nav);

    nav.querySelectorAll('[data-home-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.homeMode;
        const existing = document.querySelector(`[data-role-mode="${mode}"]`);
        if (existing) existing.click();
        else {
          document.querySelectorAll('.role-view').forEach((view) => view.classList.add('hidden'));
          $(`#${mode}View`)?.classList.remove('hidden');
        }
        syncNav();
      });
    });

    $('#mjMore')?.addEventListener('click', () => {
      const driverMenu = $('#driverMenuOverlay');
      if (driverMenu && !$('#driverView')?.classList.contains('hidden')) driverMenu.classList.remove('hidden');
      else $('#logoutButton')?.click();
    });
  }

  function syncNav() {
    const nav = $('.mj-bottom-nav');
    const appVisible = $('#appView')?.classList.contains('active-screen');
    nav?.classList.toggle('hidden', !appVisible);
    let active = null;
    if ($('#passengerView') && !$('#passengerView').classList.contains('hidden')) active = 'passenger';
    if ($('#driverView') && !$('#driverView').classList.contains('hidden')) active = 'driver';
    if ($('#adminView') && !$('#adminView').classList.contains('hidden')) active = 'admin';
    nav?.querySelectorAll('[data-home-mode]').forEach((button) => button.classList.toggle('active', button.dataset.homeMode === active));
  }

  function refineCopy() {
    const heroTitle = $('#authView .hero-card h2');
    const heroText = $('#authView .hero-card p');
    if (heroTitle) heroTitle.textContent = 'Sua cidade, mais perto';
    if (heroText) heroText.textContent = 'Corridas de moto rápidas, simples e locais em Campo Verde.';
    const requestTitle = $('#passengerRequestCard h2');
    if (requestTitle) requestTitle.textContent = 'Para onde vamos?';
    const requestButton = $('#requestRideButton');
    if (requestButton) requestButton.textContent = 'Chamar MotoJá';
  }

  function observeApp() {
    const observer = new MutationObserver(() => {
      syncNav();
      refineCopy();
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
  }

  function start() {
    buildTopActions();
    buildBottomNav();
    refineCopy();
    syncNav();
    observeApp();
    document.addEventListener('click', () => window.setTimeout(syncNav, 100));
    window.setInterval(syncNav, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

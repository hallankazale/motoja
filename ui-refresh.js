(() => {
  const THEME_KEY = 'motoja-theme';
  const $ = (selector) => document.querySelector(selector);

  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.body.classList.toggle('ui-dark', dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    const button = $('#uiThemeButton');
    if (button) {
      button.textContent = dark ? '☀️' : '🌙';
      button.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
    }
  }

  function ensureThemeButton() {
    if ($('#uiThemeButton')) return;
    const button = document.createElement('button');
    button.id = 'uiThemeButton';
    button.className = 'ui-theme-button';
    button.type = 'button';
    button.addEventListener('click', () => {
      applyTheme(document.body.classList.contains('ui-dark') ? 'light' : 'dark');
    });
    document.body.appendChild(button);
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  }

  function enhanceTopbar() {
    const topbar = $('.topbar');
    if (!topbar || topbar.dataset.uiEnhanced) return;
    topbar.dataset.uiEnhanced = 'true';
    const eyebrow = topbar.querySelector('.eyebrow');
    const title = topbar.querySelector('h1');
    if (eyebrow) eyebrow.textContent = 'CAMPO VERDE · MT';
    if (title) title.textContent = 'MotoJá';
    const logout = $('#logoutButton');
    if (logout) {
      logout.textContent = '↗';
      logout.title = 'Sair da conta';
    }
  }

  function enhancePassenger() {
    const card = $('#passengerRequestCard');
    if (!card || card.dataset.uiEnhanced) return;
    card.dataset.uiEnhanced = 'true';
    const title = card.querySelector('h2');
    if (title) title.textContent = 'Para onde vamos?';
    const button = $('#requestRideButton');
    if (button) button.textContent = 'Chamar MotoJá';
    const history = $('#passengerRides')?.closest('.panel-card');
    if (history && !history.querySelector('.ui-section-title')) {
      const oldTitle = history.querySelector('h3');
      if (oldTitle) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ui-section-title';
        wrapper.innerHTML = '<div><h3>Suas corridas</h3><small>Histórico recente</small></div>';
        oldTitle.replaceWith(wrapper);
      }
    }
  }

  function enhanceAdmin() {
    const view = $('#adminView');
    if (!view || view.dataset.uiEnhanced) return;
    view.dataset.uiEnhanced = 'true';
    const firstCard = view.querySelector('.panel-card');
    if (firstCard) {
      const heading = firstCard.querySelector('h2');
      const paragraph = firstCard.querySelector('p');
      if (heading) heading.textContent = 'Central MotoJá';
      if (paragraph) paragraph.textContent = 'Operação, tarifas, motociclistas e corridas em um só lugar.';
    }
  }

  function improveMessages() {
    const message = $('#appMessage');
    if (!message || message.dataset.uiObserved) return;
    message.dataset.uiObserved = 'true';
    const observer = new MutationObserver(() => {
      const text = message.textContent.trim();
      if (!text) return;
      if (/Cannot set properties|TypeError|Failed to fetch/i.test(text)) {
        message.textContent = 'Houve uma instabilidade temporária. Atualize a página e tente novamente.';
      }
    });
    observer.observe(message, { childList: true, characterData: true, subtree: true });
  }

  function sync() {
    ensureThemeButton();
    enhanceTopbar();
    enhancePassenger();
    enhanceAdmin();
    improveMessages();
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', () => window.setTimeout(sync, 120));
  window.setInterval(sync, 2500);
  window.setTimeout(sync, 400);
})();
(() => {
  const SPLASH_EXIT_DELAY_MS = 1200;
  const SPLASH_FALLBACK_MS = 3200;
  const TRANSITION_MS = 460;

  const splash = document.getElementById('mjSplash');
  const welcome = document.getElementById('mjWelcome');
  const startButton = document.getElementById('mjWelcomeStart');
  const loginButton = document.getElementById('mjWelcomeLogin');

  let splashClosing = false;
  let welcomeClosed = false;

  function showWelcome() {
    if (!welcome || welcomeClosed) return;
    welcome.classList.remove('is-leaving');
    welcome.classList.add('is-visible');
    welcome.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => startButton?.focus(), 380);
  }

  function closeWelcome() {
    if (!welcome || welcomeClosed) return;
    welcomeClosed = true;
    welcome.classList.remove('is-visible');
    welcome.classList.add('is-leaving');
    welcome.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      welcome.remove();
      document.getElementById('loginEmail')?.focus();
    }, 380);
  }

  function closeSplash() {
    if (splashClosing) return;
    splashClosing = true;

    // A Tela 2 sempre é preparada primeiro. Assim o login nunca aparece entre as telas.
    showWelcome();

    // Se a splash antiga já tiver sido removida por outro carregamento, a Tela 2 continua funcionando.
    if (!splash || !splash.isConnected) return;

    splash.classList.add('is-leaving');
    window.setTimeout(() => splash.remove(), TRANSITION_MS);
  }

  startButton?.addEventListener('click', closeWelcome);
  loginButton?.addEventListener('click', closeWelcome);

  if (document.readyState === 'complete') {
    closeSplash();
  } else {
    window.addEventListener('load', () => window.setTimeout(closeSplash, SPLASH_EXIT_DELAY_MS), { once: true });
  }

  // Fallback para rede lenta ou evento load que não conclua como esperado.
  window.setTimeout(closeSplash, SPLASH_FALLBACK_MS);
})();

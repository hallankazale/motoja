(() => {
  const APP_URL = 'https://hallankazale.github.io/motoja/';
  const $ = (selector) => document.querySelector(selector);
  const welcomeSeenKey = 'motoja_passenger_welcome_seen_v1';

  // O fluxo inicial do MotoJá deve ser sempre: splash -> boas-vindas -> login/app.
  // Remove a preferência antiga que fazia a tela de boas-vindas ser ignorada.
  try {
    window.localStorage.removeItem(welcomeSeenKey);
  } catch (error) {
    console.warn('Não foi possível limpar o estado antigo das boas-vindas.', error);
  }

  /**
   * Evita que a tela legada de login apareça entre a splash e a tela de boas-vindas.
   * Quando a splash começa a desaparecer, a segunda tela já fica pronta por baixo.
   */
  function shieldSplashTransition() {
    const splash = document.getElementById('mjSplash');
    const welcome = document.getElementById('mjWelcome');
    if (!splash || !welcome) return;

    const prepareWelcome = () => {
      welcome.classList.add('is-visible');
      welcome.setAttribute('aria-hidden', 'false');
    };

    const observer = new MutationObserver(() => {
      if (splash.classList.contains('is-leaving')) {
        prepareWelcome();
        observer.disconnect();
      }
    });

    observer.observe(splash, { attributes: true, attributeFilter: ['class'] });
  }

  shieldSplashTransition();

  /**
   * Mantém a interface legada invisível enquanto o Supabase restaura a sessão.
   * O CSS só permite que authView apareça depois de motoja-auth-ready.
   */
  async function gateInitialRender() {
    const phone = document.querySelector('.phone');
    if (!phone) return;

    phone.style.visibility = 'hidden';
    phone.style.opacity = '0';
    phone.style.pointerEvents = 'none';

    try {
      await client.auth.getSession();
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    } catch (error) {
      console.warn('Não foi possível restaurar a sessão inicial.', error);
    } finally {
      document.documentElement.classList.add('motoja-auth-ready');
      phone.style.transition = 'opacity 180ms ease';
      phone.style.visibility = 'visible';
      phone.style.opacity = '1';
      phone.style.pointerEvents = '';
    }
  }

  gateInitialRender();

  function setAuthMessage(text, isError = false) {
    const element = $('#authMessage');
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('error', isError);
  }

  function ensureRecoveryUi() {
    const loginForm = $('#loginForm');
    if (!loginForm || $('#forgotPasswordButton')) return;

    const forgotButton = document.createElement('button');
    forgotButton.id = 'forgotPasswordButton';
    forgotButton.type = 'button';
    forgotButton.className = 'secondary-button';
    forgotButton.textContent = 'Esqueci minha senha';
    loginForm.appendChild(forgotButton);

    const recoveryForm = document.createElement('form');
    recoveryForm.id = 'recoveryForm';
    recoveryForm.className = 'form-card hidden';
    recoveryForm.innerHTML = `
      <h3>Recuperar senha</h3>
      <p>Informe o e-mail cadastrado. Você receberá um link para criar uma nova senha.</p>
      <label>E-mail<input id="recoveryEmail" type="email" required autocomplete="email"></label>
      <button class="primary-button" type="submit">Enviar link de recuperação</button>
      <button id="cancelRecoveryButton" class="secondary-button" type="button">Voltar</button>
    `;
    loginForm.insertAdjacentElement('afterend', recoveryForm);

    const updateForm = document.createElement('form');
    updateForm.id = 'updatePasswordForm';
    updateForm.className = 'form-card hidden';
    updateForm.innerHTML = `
      <h3>Criar nova senha</h3>
      <p>Escolha uma senha com pelo menos 8 caracteres.</p>
      <label>Nova senha<input id="newPassword" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>Confirmar senha<input id="confirmNewPassword" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="primary-button" type="submit">Salvar nova senha</button>
    `;
    recoveryForm.insertAdjacentElement('afterend', updateForm);

    forgotButton.addEventListener('click', () => {
      $('#loginForm').classList.add('hidden');
      $('#signupForm').classList.add('hidden');
      $('#recoveryForm').classList.remove('hidden');
      setAuthMessage('');
    });

    $('#cancelRecoveryButton').addEventListener('click', () => {
      $('#recoveryForm').classList.add('hidden');
      $('#loginForm').classList.remove('hidden');
      setAuthMessage('');
    });

    recoveryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = $('#recoveryEmail').value.trim();
      setAuthMessage('Enviando link de recuperação...');
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}?recovery=1`,
      });
      setAuthMessage(
        error ? error.message : 'Link enviado. Abra o e-mail e toque no botão para criar uma nova senha.',
        Boolean(error),
      );
    });

    updateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('#newPassword').value;
      const confirmation = $('#confirmNewPassword').value;
      if (password !== confirmation) {
        setAuthMessage('As senhas não coincidem.', true);
        return;
      }
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        setAuthMessage(error.message, true);
        return;
      }
      setAuthMessage('Senha alterada com sucesso. Você já pode entrar com a nova senha.');
      updateForm.classList.add('hidden');
      $('#loginForm').classList.remove('hidden');
      await client.auth.signOut();
      history.replaceState({}, document.title, APP_URL);
    });
  }

  function showUpdatePassword() {
    ensureRecoveryUi();
    $('#loginForm')?.classList.add('hidden');
    $('#signupForm')?.classList.add('hidden');
    $('#recoveryForm')?.classList.add('hidden');
    $('#updatePasswordForm')?.classList.remove('hidden');
    $('#authView')?.classList.add('active-screen');
    $('#appView')?.classList.remove('active-screen');
    document.documentElement.classList.add('motoja-auth-ready');
    setAuthMessage('Link validado. Crie sua nova senha.');
  }

  document.addEventListener('DOMContentLoaded', ensureRecoveryUi);

  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showUpdatePassword();
  });

  if (new URLSearchParams(location.search).get('recovery') === '1') {
    window.setTimeout(showUpdatePassword, 350);
  }
})();
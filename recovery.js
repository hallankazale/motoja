(() => {
  const APP_URL = 'https://hallankazale.github.io/motoja/';
  const $ = (selector) => document.querySelector(selector);

  function loadAuthV3Styles() {
    if (document.querySelector('link[data-motoja-auth-v3]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'auth-v3.css?v=1';
    link.dataset.motojaAuthV3 = '1';
    document.head.appendChild(link);
  }

  loadAuthV3Styles();

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

  async function signInWithProvider(provider) {
    setAuthMessage(provider === 'google' ? 'Abrindo Google...' : 'Abrindo Apple...');
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: APP_URL,
      },
    });

    if (error) {
      const providerName = provider === 'google' ? 'Google' : 'Apple';
      setAuthMessage(`Não foi possível entrar com ${providerName}: ${error.message}`, true);
    }
  }

  function ensureAuthV3Ui() {
    const authView = $('#authView');
    const loginForm = $('#loginForm');
    if (!authView || !loginForm || authView.dataset.authV3Ready === '1') return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mj-auth-v3';

    while (authView.firstChild) {
      wrapper.appendChild(authView.firstChild);
    }
    authView.appendChild(wrapper);

    const heading = document.createElement('div');
    heading.innerHTML = `
      <div class="mj-auth-brand"><span class="mj-auth-mark" aria-hidden="true"></span><span>MotoJá</span></div>
      <div class="mj-auth-copy">
        <h2>Bem-vindo de volta.</h2>
        <p>Entre para pedir uma corrida, acompanhar seu motociclista e gerenciar sua conta com segurança.</p>
      </div>
    `;
    wrapper.insertBefore(heading, wrapper.firstChild);

    const social = document.createElement('div');
    social.className = 'mj-social-auth';
    social.innerHTML = `
      <div class="mj-auth-divider"><span>ou continue com</span></div>
      <button id="googleSignInButton" class="mj-social-button mj-social-button--google" type="button">
        <span class="mj-social-icon" aria-hidden="true">G</span><span>Continuar com Google</span>
      </button>
      <button id="appleSignInButton" class="mj-social-button mj-social-button--apple" type="button">
        <span class="mj-social-icon" aria-hidden="true"></span><span>Continuar com Apple</span>
      </button>
      <p class="mj-auth-legal">Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade do MotoJá.</p>
    `;
    loginForm.insertAdjacentElement('afterend', social);

    $('#googleSignInButton')?.addEventListener('click', () => signInWithProvider('google'));
    $('#appleSignInButton')?.addEventListener('click', () => signInWithProvider('apple'));

    authView.dataset.authV3Ready = '1';
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
      $('.mj-social-auth')?.classList.add('hidden');
      setAuthMessage('');
    });

    $('#cancelRecoveryButton').addEventListener('click', () => {
      $('#recoveryForm').classList.add('hidden');
      $('#loginForm').classList.remove('hidden');
      $('.mj-social-auth')?.classList.remove('hidden');
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
      $('.mj-social-auth')?.classList.remove('hidden');
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
    $('.mj-social-auth')?.classList.add('hidden');
    $('#authView')?.classList.add('active-screen');
    $('#appView')?.classList.remove('active-screen');
    document.documentElement.classList.add('motoja-auth-ready');
    setAuthMessage('Link validado. Crie sua nova senha.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureAuthV3Ui();
    ensureRecoveryUi();
  });

  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showUpdatePassword();
  });

  if (new URLSearchParams(location.search).get('recovery') === '1') {
    window.setTimeout(showUpdatePassword, 350);
  }
})();
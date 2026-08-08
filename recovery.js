(() => {
  const APP_URL = 'https://hallankazale.github.io/motoja/';
  const $ = (selector) => document.querySelector(selector);

  function loadAuthV3Styles() {
    if (document.querySelector('link[data-motoja-auth-v3]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'auth-v3.css?v=3';
    link.dataset.motojaAuthV3 = '1';
    document.head.appendChild(link);
  }

  loadAuthV3Styles();

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
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: APP_URL } });
    if (error) {
      const providerName = provider === 'google' ? 'Google' : 'Apple';
      setAuthMessage(`Não foi possível entrar com ${providerName}: ${error.message}`, true);
    }
  }

  function fieldIcon(type) {
    if (type === 'mail') return '<span class="mj-field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg></span>';
    return '<span class="mj-field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path><path d="M12 15v2"></path></svg></span>';
  }

  function ensureFieldDecorations() {
    const email = $('#loginEmail');
    const password = $('#loginPassword');
    if (!email || !password) return;
    email.placeholder = 'E-mail';
    password.placeholder = 'Senha';
    const emailLabel = email.closest('label');
    const passwordLabel = password.closest('label');
    if (emailLabel && !emailLabel.querySelector('.mj-field-icon')) emailLabel.insertAdjacentHTML('beforeend', fieldIcon('mail'));
    if (passwordLabel && !passwordLabel.querySelector('.mj-field-icon')) passwordLabel.insertAdjacentHTML('beforeend', fieldIcon('lock'));
    if (passwordLabel && !passwordLabel.querySelector('.mj-password-toggle')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'mj-password-toggle';
      toggle.setAttribute('aria-label', 'Mostrar senha');
      toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>';
      toggle.addEventListener('click', () => {
        const showing = password.type === 'text';
        password.type = showing ? 'password' : 'text';
        toggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
      });
      passwordLabel.appendChild(toggle);
    }
  }

  function showLoginUi() {
    $('#showLogin')?.click();
    $('.mj-social-auth')?.classList.remove('hidden');
    $('.mj-auth-bottom')?.classList.remove('hidden');
    $('.mj-auth-signup-title')?.classList.add('hidden');
    $('.mj-auth-back')?.classList.add('hidden');
    setAuthMessage('');
  }

  function showSignupUi() {
    $('#showSignup')?.click();
    $('.mj-social-auth')?.classList.add('hidden');
    $('.mj-auth-bottom')?.classList.add('hidden');
    $('.mj-auth-signup-title')?.classList.remove('hidden');
    $('.mj-auth-back')?.classList.remove('hidden');
    setAuthMessage('');
  }

  function ensureAuthV3Ui() {
    const authView = $('#authView');
    const loginForm = $('#loginForm');
    const signupForm = $('#signupForm');
    if (!authView || !loginForm || authView.dataset.authV3Ready === '1') return;
    const wrapper = document.createElement('div');
    wrapper.className = 'mj-auth-v3';
    while (authView.firstChild) wrapper.appendChild(authView.firstChild);
    authView.appendChild(wrapper);

    const heading = document.createElement('div');
    heading.className = 'mj-auth-heading';
    heading.innerHTML = '<div class="mj-auth-brand" aria-label="MotoJá"><span class="mj-auth-mark" aria-hidden="true"></span><span class="mj-auth-brand-name"><strong>Moto</strong><em>Já</em></span></div><div class="mj-auth-copy"><h2>Bem-vindo de volta!</h2><p>Faça login para continuar</p></div>';
    wrapper.insertBefore(heading, wrapper.firstChild);
    ensureFieldDecorations();

    const social = document.createElement('div');
    social.className = 'mj-social-auth';
    social.innerHTML = `
      <div class="mj-auth-divider"><span>ou continue com</span></div>
      <button id="googleSignInButton" class="mj-social-button" type="button">
        <span class="mj-social-icon" aria-hidden="true"><img src="https://developers.google.com/identity/images/g-logo.png" alt=""></span>
        <span class="mj-social-label">Continuar com Google</span>
      </button>
      <button id="appleSignInButton" class="mj-social-button" type="button">
        <span class="mj-social-icon mj-social-icon--apple" aria-hidden="true"><svg viewBox="0 0 24 24" role="img"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.34.07 2.27.74 3.06.79 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.51 4.09ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z"/></svg></span>
        <span class="mj-social-label">Continuar com Apple</span>
      </button>`;
    loginForm.insertAdjacentElement('afterend', social);

    const bottom = document.createElement('div');
    bottom.className = 'mj-auth-bottom';
    bottom.innerHTML = 'Ainda não tem conta? <button id="mjCreateAccount" type="button">Criar conta</button>';
    social.insertAdjacentElement('afterend', bottom);

    if (signupForm) {
      const signupTitle = document.createElement('h3');
      signupTitle.className = 'mj-auth-signup-title hidden';
      signupTitle.textContent = 'Criar sua conta';
      signupForm.insertAdjacentElement('beforebegin', signupTitle);
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'mj-auth-back hidden';
      back.textContent = '← Voltar para entrar';
      signupForm.insertAdjacentElement('afterend', back);
      back.addEventListener('click', showLoginUi);
    }

    $('#googleSignInButton')?.addEventListener('click', () => signInWithProvider('google'));
    $('#appleSignInButton')?.addEventListener('click', () => signInWithProvider('apple'));
    $('#mjCreateAccount')?.addEventListener('click', showSignupUi);
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
    recoveryForm.innerHTML = '<h3>Recuperar senha</h3><p>Informe o e-mail cadastrado. Você receberá um link para criar uma nova senha.</p><label>E-mail<input id="recoveryEmail" type="email" required autocomplete="email"></label><button class="primary-button" type="submit">Enviar link de recuperação</button><button id="cancelRecoveryButton" class="mj-auth-back" type="button">Voltar</button>';
    loginForm.insertAdjacentElement('afterend', recoveryForm);

    const updateForm = document.createElement('form');
    updateForm.id = 'updatePasswordForm';
    updateForm.className = 'form-card hidden';
    updateForm.innerHTML = '<h3>Criar nova senha</h3><p>Escolha uma senha com pelo menos 8 caracteres.</p><label>Nova senha<input id="newPassword" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirmar senha<input id="confirmNewPassword" type="password" minlength="8" required autocomplete="new-password"></label><button class="primary-button" type="submit">Salvar nova senha</button>';
    recoveryForm.insertAdjacentElement('afterend', updateForm);

    forgotButton.addEventListener('click', () => {
      $('#loginForm')?.classList.add('hidden');
      $('#signupForm')?.classList.add('hidden');
      $('#recoveryForm')?.classList.remove('hidden');
      $('.mj-social-auth')?.classList.add('hidden');
      $('.mj-auth-bottom')?.classList.add('hidden');
      setAuthMessage('');
    });
    $('#cancelRecoveryButton')?.addEventListener('click', () => {
      $('#recoveryForm')?.classList.add('hidden');
      $('#loginForm')?.classList.remove('hidden');
      $('.mj-social-auth')?.classList.remove('hidden');
      $('.mj-auth-bottom')?.classList.remove('hidden');
      setAuthMessage('');
    });
    recoveryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = $('#recoveryEmail').value.trim();
      setAuthMessage('Enviando link de recuperação...');
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}?recovery=1` });
      setAuthMessage(error ? error.message : 'Link enviado. Abra o e-mail e toque no botão para criar uma nova senha.', Boolean(error));
    });
    updateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('#newPassword').value;
      const confirmation = $('#confirmNewPassword').value;
      if (password !== confirmation) return setAuthMessage('As senhas não coincidem.', true);
      const { error } = await client.auth.updateUser({ password });
      if (error) return setAuthMessage(error.message, true);
      setAuthMessage('Senha alterada com sucesso. Você já pode entrar com a nova senha.');
      updateForm.classList.add('hidden');
      $('#loginForm')?.classList.remove('hidden');
      $('.mj-social-auth')?.classList.remove('hidden');
      $('.mj-auth-bottom')?.classList.remove('hidden');
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
    $('.mj-auth-bottom')?.classList.add('hidden');
    $('#authView')?.classList.add('active-screen');
    $('#appView')?.classList.remove('active-screen');
    document.documentElement.classList.add('motoja-auth-ready');
    setAuthMessage('Link validado. Crie sua nova senha.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureAuthV3Ui();
    ensureRecoveryUi();
  });
  client.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showUpdatePassword(); });
  if (new URLSearchParams(location.search).get('recovery') === '1') window.setTimeout(showUpdatePassword, 350);
})();
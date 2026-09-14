(() => {
  let selectedMode = 'passenger';

  function modeLabel(mode) {
    return mode === 'admin' ? 'Administrador' : mode === 'driver' ? 'Motociclista' : 'Passageiro';
  }

  function availableModes(profile) {
    return [
      profile.is_admin && 'admin',
      profile.can_passenger && 'passenger',
      profile.can_driver && 'driver',
    ].filter(Boolean);
  }

  function ensureAdminReturnButton(profile) {
    let button = document.querySelector('#adminReturnButton');

    if (!profile.is_admin) {
      button?.remove();
      return;
    }

    if (!button) {
      button = document.createElement('button');
      button.id = 'adminReturnButton';
      button.type = 'button';
      button.className = 'admin-return-button hidden';
      button.innerHTML = '<span aria-hidden="true">←</span> Administrador';
      button.setAttribute('aria-label', 'Voltar ao painel do administrador');
      document.body.appendChild(button);

      button.addEventListener('click', async () => {
        selectedMode = 'admin';
        await renderSelectedMode(profile);
      });
    }

    button.classList.toggle('hidden', selectedMode === 'admin');
  }

  function ensureModeSelector(profile) {
    let selector = document.querySelector('#modeSelector');
    if (!selector) {
      selector = document.createElement('nav');
      selector.id = 'modeSelector';
      selector.className = 'mode-selector';
      selector.setAttribute('aria-label', 'Alternar área do MotoJá');
      document.querySelector('#accountBanner')?.insertAdjacentElement('afterend', selector);

      const style = document.createElement('style');
      style.textContent = `
        .mode-selector{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 14px;padding:6px;border-radius:14px;background:#e2e8f0}
        .mode-selector button{border:0;border-radius:10px;padding:10px 5px;background:transparent;color:#475569;font-size:.78rem;font-weight:800}
        .mode-selector button.active{background:#111827;color:#fff;box-shadow:0 4px 12px rgba(15,23,42,.18)}
        .mode-selector button.hidden{display:none}
        .admin-return-button{position:fixed;left:14px;top:calc(env(safe-area-inset-top) + 82px);z-index:1400;display:flex;align-items:center;gap:7px;min-height:46px;padding:0 15px;border:1px solid rgba(255,255,255,.92);border-radius:16px;background:rgba(255,255,255,.96);color:#101828;font-size:13px;font-weight:900;box-shadow:0 10px 28px rgba(15,23,42,.22);backdrop-filter:blur(16px)}
        .admin-return-button.hidden{display:none!important}
        .admin-return-button span{font-size:18px;line-height:1}
      `;
      document.head.appendChild(style);
    }

    const modes = availableModes(profile);
    if (!modes.includes(selectedMode)) selectedMode = modes[0] || 'passenger';

    selector.innerHTML = ['admin', 'passenger', 'driver'].map((mode) => {
      const enabled = modes.includes(mode);
      return `<button type="button" data-mode="${mode}" class="${enabled ? '' : 'hidden'} ${selectedMode === mode ? 'active' : ''}">${modeLabel(mode)}</button>`;
    }).join('');

    selector.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', async () => {
        selectedMode = button.dataset.mode;
        await renderSelectedMode(profile);
      });
    });
  }

  async function renderSelectedMode(profile) {
    document.querySelectorAll('.role-view').forEach((view) => view.classList.add('hidden'));
    document.querySelector(`#${selectedMode}View`)?.classList.remove('hidden');

    document.querySelectorAll('#modeSelector [data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === selectedMode);
    });

    const banner = document.querySelector('#accountBanner');
    if (banner) banner.textContent = `${profile.full_name} · ${modeLabel(selectedMode)}`;

    ensureAdminReturnButton(profile);

    currentProfile = { ...profile, role: selectedMode };
    if (selectedMode === 'passenger') await loadPassenger();
    if (selectedMode === 'driver') await loadDriver();
    if (selectedMode === 'admin') await loadAdmin();
    if (typeof subscribeRides === 'function') subscribeRides();
  }

  loadProfile = async function loadMultiRoleProfile() {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Perfil ainda não foi criado. Saia e entre novamente.');

    currentProfile = data;

    // Administradores sempre entram pela Central MotoJá.
    // Usuários comuns entram diretamente no primeiro modo permitido.
    const modes = availableModes(data);
    selectedMode = data.is_admin && modes.includes('admin') ? 'admin' : (modes[0] || data.role || 'passenger');

    ensureModeSelector(data);
    ensureAdminReturnButton(data);
    await renderSelectedMode(data);
  };
})();
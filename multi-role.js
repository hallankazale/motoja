(() => {
  let selectedMode = window.localStorage.getItem('motoja_mode') || 'admin';

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

  function ensureModeSelector(profile) {
    let selector = document.querySelector('#modeSelector');
    if (!selector) {
      selector = document.createElement('nav');
      selector.id = 'modeSelector';
      selector.className = 'mode-selector';
      document.querySelector('#accountBanner')?.insertAdjacentElement('afterend', selector);

      const style = document.createElement('style');
      style.textContent = `
        .mode-selector{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 14px;padding:6px;border-radius:14px;background:#e2e8f0}
        .mode-selector button{border:0;border-radius:10px;padding:10px 5px;background:transparent;color:#475569;font-size:.78rem;font-weight:800}
        .mode-selector button.active{background:#111827;color:#fff;box-shadow:0 4px 12px rgba(15,23,42,.18)}
        .mode-selector button.hidden{display:none}
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
        window.localStorage.setItem('motoja_mode', selectedMode);
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
    ensureModeSelector(data);
    await renderSelectedMode(data);
  };
})();
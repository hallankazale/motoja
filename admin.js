(() => {
  const adminClient = window.supabase.createClient(
    window.MOTOJA_CONFIG.supabaseUrl,
    window.MOTOJA_CONFIG.supabasePublishableKey
  );

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const activeStatuses = new Set(['requested', 'accepted', 'driver_arriving', 'in_progress']);

  function showMessage(text, isError = false) {
    const message = $('#appMessage');
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  async function isCurrentUserAdmin(userId) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    return !error && data?.role === 'admin';
  }

  async function requireAdmin() {
    const { data } = await adminClient.auth.getSession();
    const user = data.session?.user;
    if (!user || !(await isCurrentUserAdmin(user.id))) {
      showMessage('Somente o administrador pode executar esta ação.', true);
      return null;
    }
    return user;
  }

  async function cancelRide(rideId) {
    if (!(await requireAdmin())) return;
    if (!window.confirm('Cancelar esta corrida e liberar o motociclista?')) return;

    showMessage('Cancelando corrida...');
    const { error } = await adminClient.rpc('admin_cancel_ride', {
      p_ride_id: rideId,
      p_reason: 'Cancelada pelo painel administrativo durante o piloto'
    });

    showMessage(error ? error.message : 'Corrida cancelada e motociclista liberado.', Boolean(error));
    if (!error) await refreshAdmin();
  }

  async function releaseDriver(driverId) {
    if (!(await requireAdmin())) return;
    if (!window.confirm('Cancelar corridas ativas e liberar este motociclista?')) return;

    showMessage('Liberando motociclista...');
    const { data, error } = await adminClient.rpc('admin_release_driver', { p_driver_id: driverId });
    const count = Number(data || 0);
    showMessage(
      error ? error.message : `Motociclista liberado. ${count} corrida(s) ativa(s) cancelada(s).`,
      Boolean(error)
    );
    if (!error) await refreshAdmin();
  }

  async function loadAdminEnhancements(userId) {
    if (!(await isCurrentUserAdmin(userId))) return;

    const [driversResult, ridesResult, pricingResult, profilesResult] = await Promise.all([
      adminClient.from('drivers').select('user_id,approval_status,is_online,subscription_status'),
      adminClient.from('rides').select('id,driver_id,status,estimated_price,pickup_address,destination_address,requested_at').order('requested_at', { ascending: false }).limit(50),
      adminClient.from('pricing_rules').select('*').eq('city', 'Campo Verde').eq('state', 'MT').maybeSingle(),
      adminClient.from('profiles').select('id,full_name')
    ]);

    if (driversResult.error || ridesResult.error || pricingResult.error || profilesResult.error) {
      showMessage('Não foi possível carregar todos os dados administrativos.', true);
      return;
    }

    const drivers = driversResult.data || [];
    const rides = ridesResult.data || [];
    const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile.full_name]));
    const completed = rides.filter((ride) => ride.status === 'completed');
    const active = rides.filter((ride) => activeStatuses.has(ride.status));
    const estimatedVolume = completed.reduce((total, ride) => total + Number(ride.estimated_price || 0), 0);

    $('#adminStats').innerHTML = [
      ['Motociclistas', drivers.length],
      ['Aguardando', drivers.filter((driver) => driver.approval_status === 'pending').length],
      ['Online', drivers.filter((driver) => driver.is_online).length],
      ['Corridas ativas', active.length],
      ['Concluídas', completed.length],
      ['Volume estimado', money(estimatedVolume)]
    ].map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`).join('');

    const pricing = pricingResult.data;
    if (pricing) {
      $('#adminBaseFare').value = pricing.base_fare;
      $('#adminMinimumFare').value = pricing.minimum_fare;
      $('#adminPricePerKm').value = pricing.price_per_km;
      $('#adminPricePerMinute').value = pricing.price_per_minute;
    }

    const activeByDriver = new Set(active.filter((ride) => ride.driver_id).map((ride) => ride.driver_id));
    document.querySelectorAll('#adminDrivers [data-driver]').forEach((button) => {
      const driverId = button.dataset.driver;
      const container = button.closest('.inline-actions');
      if (!container || container.querySelector(`[data-release-driver="${driverId}"]`)) return;
      const releaseButton = document.createElement('button');
      releaseButton.type = 'button';
      releaseButton.dataset.releaseDriver = driverId;
      releaseButton.textContent = activeByDriver.has(driverId) ? 'Liberar corrida' : 'Liberar motorista';
      releaseButton.className = 'admin-release-button';
      releaseButton.addEventListener('click', () => releaseDriver(driverId));
      container.appendChild(releaseButton);
    });

    $('#adminRides').innerHTML = rides.length ? rides.map((ride) => {
      const driverName = ride.driver_id ? profiles.get(ride.driver_id) || 'Motociclista' : 'Sem motociclista';
      const cancelButton = activeStatuses.has(ride.status)
        ? `<button type="button" class="admin-cancel-button" data-admin-cancel="${ride.id}">Cancelar e liberar</button>`
        : '';
      return `<article class="list-item admin-ride-item">
        <div>
          <strong>${escapeHtml(ride.destination_address)}</strong>
          <span>${escapeHtml(ride.status)} · ${money(ride.estimated_price)}</span>
          <small>${escapeHtml(driverName)} · ${new Date(ride.requested_at).toLocaleString('pt-BR')}</small>
        </div>
        ${cancelButton}
      </article>`;
    }).join('') : '<p>Nenhuma corrida.</p>';

    document.querySelectorAll('[data-admin-cancel]').forEach((button) => {
      button.addEventListener('click', () => cancelRide(button.dataset.adminCancel));
    });
  }

  async function refreshAdmin() {
    const { data } = await adminClient.auth.getSession();
    if (!data.session?.user) return;
    if (typeof window.loadAdmin === 'function') await window.loadAdmin();
    await loadAdminEnhancements(data.session.user.id);
  }

  async function savePricing(event) {
    event.preventDefault();
    const user = await requireAdmin();
    if (!user) return;

    const payload = {
      base_fare: Number($('#adminBaseFare').value),
      minimum_fare: Number($('#adminMinimumFare').value),
      price_per_km: Number($('#adminPricePerKm').value),
      price_per_minute: Number($('#adminPricePerMinute').value),
      updated_at: new Date().toISOString()
    };

    if (Object.values(payload).slice(0, 4).some((value) => !Number.isFinite(value) || value < 0)) {
      showMessage('Informe valores de tarifa válidos.', true);
      return;
    }

    const { error } = await adminClient
      .from('pricing_rules')
      .update(payload)
      .eq('city', 'Campo Verde')
      .eq('state', 'MT');

    showMessage(error ? error.message : 'Tarifas atualizadas com sucesso.', Boolean(error));
    if (!error) await loadAdminEnhancements(user.id);
  }

  $('#pricingForm')?.addEventListener('submit', savePricing);

  adminClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(() => loadAdminEnhancements(session.user.id), 400);
  });

  adminClient.auth.getSession().then(({ data }) => {
    if (data.session?.user) window.setTimeout(() => loadAdminEnhancements(data.session.user.id), 400);
  });
})();
(() => {
  const adminClient = window.supabase.createClient(
    window.MOTOJA_CONFIG.supabaseUrl,
    window.MOTOJA_CONFIG.supabasePublishableKey
  );

  const $ = (selector) => document.querySelector(selector);
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function showMessage(text, isError = false) {
    const message = $('#appMessage');
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  async function isCurrentUserAdmin(userId) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    return !error && data?.role === 'admin';
  }

  async function loadAdminEnhancements(userId) {
    if (!(await isCurrentUserAdmin(userId))) return;

    const [driversResult, ridesResult, pricingResult] = await Promise.all([
      adminClient.from('drivers').select('user_id,approval_status,is_online,subscription_status'),
      adminClient.from('rides').select('id,status,estimated_price'),
      adminClient.from('pricing_rules').select('*').eq('city', 'Campo Verde').eq('state', 'MT').maybeSingle()
    ]);

    if (driversResult.error || ridesResult.error || pricingResult.error) {
      showMessage('Não foi possível carregar todos os dados administrativos.', true);
      return;
    }

    const drivers = driversResult.data || [];
    const rides = ridesResult.data || [];
    const completed = rides.filter((ride) => ride.status === 'completed');
    const estimatedVolume = completed.reduce((total, ride) => total + Number(ride.estimated_price || 0), 0);

    $('#adminStats').innerHTML = [
      ['Motociclistas', drivers.length],
      ['Aguardando', drivers.filter((driver) => driver.approval_status === 'pending').length],
      ['Online', drivers.filter((driver) => driver.is_online).length],
      ['Corridas', rides.length],
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
  }

  async function savePricing(event) {
    event.preventDefault();
    const { data: sessionData } = await adminClient.auth.getSession();
    const user = sessionData.session?.user;
    if (!user || !(await isCurrentUserAdmin(user.id))) {
      showMessage('Somente o administrador pode alterar tarifas.', true);
      return;
    }

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
    if (session?.user) window.setTimeout(() => loadAdminEnhancements(session.user.id), 250);
  });

  adminClient.auth.getSession().then(({ data }) => {
    if (data.session?.user) window.setTimeout(() => loadAdminEnhancements(data.session.user.id), 250);
  });
})();
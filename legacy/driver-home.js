(() => {
  const driverUiClient = window.supabase.createClient(
    window.MOTOJA_CONFIG.supabaseUrl,
    window.MOTOJA_CONFIG.supabasePublishableKey
  );
  const $ = (selector) => document.querySelector(selector);
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let map = null;
  let marker = null;
  let observer = null;
  let refreshTimer = null;

  function driverVisible() {
    const view = $('#driverView');
    return Boolean(view && !view.classList.contains('hidden'));
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function ensureStructure() {
    const view = $('#driverView');
    if (!view || $('#driverHomeShell')) return;

    const children = Array.from(view.children);
    const approvalCard = children[0];
    const activeRide = $('#driverActiveRide');
    const setup = $('#driverSetupForm');
    const openRides = $('#openRidesCard');
    const historyCard = children.find((node) => node.querySelector?.('#driverRides'));

    view.insertAdjacentHTML('afterbegin', `
      <section id="driverHomeShell" class="driver-home-shell">
        <div id="driverHomeMap" class="driver-home-map" aria-label="Mapa do motociclista"></div>
        <header class="driver-home-top">
          <button id="driverMenuButton" class="driver-circle-button" aria-label="Abrir menu">☰</button>
          <button id="driverEarningsButton" class="driver-earnings-pill" aria-label="Ver ganhos do dia">R$ 0,00</button>
          <button id="driverCenterMap" class="driver-circle-button" aria-label="Centralizar mapa">⌖</button>
        </header>
        <div class="driver-map-actions"><button id="driverLayersButton" aria-label="Alternar mapa">◫</button></div>
        <section class="driver-bottom-sheet">
          <div class="driver-sheet-handle"></div>
          <div class="driver-status-row">
            <div class="driver-status-copy"><small>Status atual</small><strong id="driverHomeStatus">Offline</strong></div>
            <button id="driverHomeOnline" class="driver-online-button">Ficar online</button>
          </div>
          <p id="driverHomeLocation" class="driver-location-mini">Ative a disponibilidade para começar.</p>
          <div class="driver-quick-grid">
            <article class="driver-quick-card"><span>Hoje</span><strong id="driverTodayGross">R$ 0,00</strong></article>
            <article class="driver-quick-card"><span>Corridas</span><strong id="driverTodayCount">0</strong></article>
            <article class="driver-quick-card"><span>Avaliação</span><strong id="driverRating">—</strong></article>
          </div>
          <nav class="driver-sheet-tabs" aria-label="Áreas do motociclista">
            <button data-driver-tab="home" class="active">Início</button>
            <button data-driver-tab="earnings">Ganhos</button>
            <button data-driver-tab="history">Histórico</button>
            <button data-driver-tab="vehicle">Veículo</button>
          </nav>
          <div id="driverTabHome" class="driver-sheet-panel active"></div>
          <div id="driverTabEarnings" class="driver-sheet-panel"></div>
          <div id="driverTabHistory" class="driver-sheet-panel"></div>
          <div id="driverTabVehicle" class="driver-sheet-panel"></div>
        </section>
      </section>
      <section id="driverMenuOverlay" class="driver-menu-overlay hidden">
        <aside class="driver-side-menu">
          <div class="driver-profile-head"><h2 id="driverMenuName">Motociclista</h2><p id="driverMenuRating">MotoJá · Campo Verde</p></div>
          <div class="driver-menu-links">
            <button data-menu-tab="earnings">Central de ganhos</button>
            <button data-menu-tab="history">Histórico de corridas</button>
            <button data-menu-tab="vehicle">Veículo e PIX</button>
            <button data-menu-tab="home">Solicitações</button>
            <button id="driverMenuClose">Fechar menu</button>
          </div>
        </aside>
      </section>`);

    // Os controles legados continuam no DOM porque app.js e dispatch.js os utilizam.
    // Apenas ocultamos visualmente o cartão antigo para evitar referências nulas.
    if (approvalCard) {
      approvalCard.classList.add('hidden');
      approvalCard.setAttribute('aria-hidden', 'true');
    }
    if (activeRide) $('#driverTabHome')?.append(activeRide);
    if (openRides) $('#driverTabHome')?.append(openRides);
    if (historyCard) {
      const driverRides = $('#driverRides');
      if (driverRides) $('#driverTabHistory')?.append(driverRides);
      historyCard.remove();
    }
    if (setup) $('#driverTabVehicle')?.append(setup);

    $('#driverHomeOnline')?.addEventListener('click', () => $('#onlineToggle')?.click());
    $('#driverCenterMap')?.addEventListener('click', centerOnDriver);
    $('#driverMenuButton')?.addEventListener('click', () => $('#driverMenuOverlay')?.classList.remove('hidden'));
    $('#driverMenuClose')?.addEventListener('click', () => $('#driverMenuOverlay')?.classList.add('hidden'));
    $('#driverMenuOverlay')?.addEventListener('click', (event) => {
      if (event.target.id === 'driverMenuOverlay') event.currentTarget.classList.add('hidden');
    });
    $('#driverEarningsButton')?.addEventListener('click', () => selectTab('earnings'));
    document.querySelectorAll('[data-driver-tab]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.driverTab)));
    document.querySelectorAll('[data-menu-tab]').forEach((button) => button.addEventListener('click', () => {
      selectTab(button.dataset.menuTab);
      $('#driverMenuOverlay')?.classList.add('hidden');
    }));

    initMap();
    observeLocationText();
  }

  function selectTab(name) {
    document.querySelectorAll('[data-driver-tab]').forEach((button) => button.classList.toggle('active', button.dataset.driverTab === name));
    ['home', 'earnings', 'history', 'vehicle'].forEach((tab) => {
      $(`#driverTab${tab[0].toUpperCase()}${tab.slice(1)}`)?.classList.toggle('active', tab === name);
    });
  }

  function initMap() {
    if (map || !$('#driverHomeMap') || !window.L) return;
    map = L.map('driverHomeMap', { zoomControl: false, attributionControl: true }).setView([-15.545, -55.162], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    window.setTimeout(() => map.invalidateSize(), 250);
  }

  function centerOnDriver() {
    if (marker && map) map.setView(marker.getLatLng(), 17, { animate: true });
    else if (navigator.geolocation) navigator.geolocation.getCurrentPosition((position) => updateMap(position.coords.latitude, position.coords.longitude), () => {});
  }

  function updateMap(lat, lng) {
    initMap();
    if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const icon = L.divIcon({ className: '', html: '<div class="driver-marker-icon">🏍️</div>', iconSize: [42, 42], iconAnchor: [21, 21] });
    if (marker) marker.setLatLng([lat, lng]);
    else marker = L.marker([lat, lng], { icon, title: 'Sua localização' }).addTo(map);
    if (!map.getBounds().contains([lat, lng])) map.setView([lat, lng], 16);
  }

  function observeLocationText() {
    const source = $('#driverLocationStatus');
    if (!source || observer) return;
    const syncLocation = () => setText('#driverHomeLocation', source.textContent || 'Localização indisponível.');
    observer = new MutationObserver(syncLocation);
    observer.observe(source, { childList: true, characterData: true, subtree: true });
    syncLocation();
  }

  async function loadSummary() {
    if (!driverVisible()) return;
    ensureStructure();
    const { data: sessionData } = await driverUiClient.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [profileResult, driverResult, ridesResult, ratingsResult] = await Promise.all([
      driverUiClient.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      driverUiClient.from('drivers').select('is_online,current_lat,current_lng,approval_status,subscription_status').eq('user_id', user.id).maybeSingle(),
      driverUiClient.from('rides').select('id,status,estimated_price,final_price,payment_method,payment_status,pickup_address,destination_address,requested_at,completed_at').eq('driver_id', user.id).order('requested_at', { ascending: false }).limit(100),
      driverUiClient.from('ratings').select('stars').eq('driver_id', user.id),
    ]);

    const profile = profileResult.data;
    const driver = driverResult.data;
    const rides = ridesResult.data || [];
    const completedToday = rides.filter((ride) => ride.status === 'completed' && new Date(ride.completed_at || ride.requested_at) >= today);
    const grossToday = completedToday.reduce((sum, ride) => sum + Number(ride.final_price || ride.estimated_price || 0), 0);
    const ratings = ratingsResult.data || [];
    const rating = ratings.length ? ratings.reduce((sum, item) => sum + Number(item.stars || 0), 0) / ratings.length : null;

    setText('#driverEarningsButton', money(grossToday));
    setText('#driverTodayGross', money(grossToday));
    setText('#driverTodayCount', String(completedToday.length));
    setText('#driverRating', rating ? `${rating.toFixed(2)} ★` : '—');
    setText('#driverMenuName', profile?.full_name || 'Motociclista');
    setText('#driverMenuRating', rating ? `${rating.toFixed(2)} ★ · MotoJá` : 'MotoJá · Campo Verde');

    const online = Boolean(driver?.is_online);
    setText('#driverHomeStatus', online ? 'Buscando corridas' : 'Offline');
    setText('#driverHomeOnline', online ? 'Desconectar' : 'Ficar online');
    $('#driverHomeOnline')?.classList.toggle('online', online);
    if (Number.isFinite(Number(driver?.current_lat)) && Number.isFinite(Number(driver?.current_lng))) updateMap(Number(driver.current_lat), Number(driver.current_lng));

    const earningsPanel = $('#driverTabEarnings');
    if (earningsPanel) earningsPanel.innerHTML = `
      <article class="panel-card"><h3>Central de ganhos</h3>
        <div class="driver-quick-grid"><article class="driver-quick-card"><span>Hoje</span><strong>${money(grossToday)}</strong></article><article class="driver-quick-card"><span>Semana</span><strong>${money(sumPeriod(rides, 7))}</strong></article><article class="driver-quick-card"><span>Mês</span><strong>${money(sumMonth(rides))}</strong></article></div>
        <p><strong>PIX e dinheiro vão direto ao motociclista.</strong></p><p>O MotoJá não retém saldo das corridas neste modelo.</p>
      </article>`;

    const history = rides.slice(0, 30).map((ride) => `<article class="driver-history-item"><header><strong>${escapeHtml(ride.destination_address)}</strong><span>${money(ride.final_price || ride.estimated_price)}</span></header><p>${escapeHtml(ride.pickup_address)} → ${escapeHtml(ride.destination_address)}</p><small>${statusLabel(ride.status)} · ${ride.payment_method === 'pix' ? 'PIX' : 'Dinheiro'} · ${new Date(ride.requested_at).toLocaleString('pt-BR')}</small></article>`).join('');
    const historyPanel = $('#driverTabHistory');
    if (historyPanel) historyPanel.innerHTML = history || '<p>Nenhuma corrida registrada.</p>';
  }

  function sumPeriod(rides, days) {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return rides.filter((ride) => ride.status === 'completed' && new Date(ride.completed_at || ride.requested_at) >= start).reduce((sum, ride) => sum + Number(ride.final_price || ride.estimated_price || 0), 0);
  }

  function sumMonth(rides) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return rides.filter((ride) => ride.status === 'completed' && new Date(ride.completed_at || ride.requested_at) >= start).reduce((sum, ride) => sum + Number(ride.final_price || ride.estimated_price || 0), 0);
  }

  function statusLabel(status) {
    return ({ requested: 'Procurando', accepted: 'Aceita', driver_arriving: 'A caminho', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' })[status] || status;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function sync() {
    ensureStructure();
    if (driverVisible()) {
      $('#driverHomeShell')?.classList.remove('hidden');
      window.setTimeout(() => map?.invalidateSize(), 150);
      loadSummary().catch(() => {});
      if (!refreshTimer) refreshTimer = window.setInterval(() => loadSummary().catch(() => {}), 8000);
    } else {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  document.addEventListener('click', () => window.setTimeout(sync, 350));
  document.addEventListener('change', (event) => { if (event.target?.id === 'onlineToggle') window.setTimeout(sync, 500); });
  driverUiClient.auth.onAuthStateChange(() => window.setTimeout(sync, 800));
  window.setInterval(sync, 4000);
  window.setTimeout(sync, 1100);
})();
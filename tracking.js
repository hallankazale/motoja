(() => {
  const trackingClient = window.supabase.createClient(
    window.MOTOJA_CONFIG.supabaseUrl,
    window.MOTOJA_CONFIG.supabasePublishableKey
  );
  const $ = (selector) => document.querySelector(selector);
  let trackingMap = null;
  let driverMarker = null;
  let targetMarker = null;
  let connectionLine = null;
  let pollTimer = null;
  let lastRideId = null;

  function ensureUi() {
    if ($('#liveTrackingCard') || !$('#passengerActiveRide')) return;
    $('#passengerActiveRide').insertAdjacentHTML('afterend', `
      <section id="liveTrackingCard" class="live-tracking-card hidden" aria-live="polite">
        <div class="live-tracking-header">
          <div><h3>Motociclista em tempo real</h3><p id="trackingStatus">Aguardando localização...</p></div>
          <span id="trackingBadge" class="tracking-live-badge">AO VIVO</span>
        </div>
        <div id="liveTrackingMap" class="live-tracking-map" aria-label="Localização do motociclista"></div>
        <div class="tracking-stats">
          <div class="tracking-stat"><span id="trackingDistanceLabel">Distância até você</span><strong id="trackingDistance">—</strong></div>
          <div class="tracking-stat"><span>Tempo aproximado</span><strong id="trackingEta">—</strong></div>
        </div>
      </section>`);
  }

  function initMap() {
    ensureUi();
    if (trackingMap || !$('#liveTrackingMap') || !window.L) return;
    trackingMap = L.map('liveTrackingMap', { zoomControl: true, attributionControl: true }).setView([-15.545, -55.162], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(trackingMap);
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatEta(distanceKm, rideStatus) {
    const averageSpeed = rideStatus === 'in_progress' ? 28 : 22;
    const minutes = Math.max(1, Math.round((distanceKm / averageSpeed) * 60));
    return `aprox. ${minutes} min`;
  }

  function hideTracking() {
    $('#liveTrackingCard')?.classList.add('hidden');
    lastRideId = null;
  }

  function renderTracking(data) {
    ensureUi();
    initMap();
    const card = $('#liveTrackingCard');
    const driverLat = Number(data.driver_lat);
    const driverLng = Number(data.driver_lng);
    const targetLat = Number(data.target_lat);
    const targetLng = Number(data.target_lng);
    if (![driverLat, driverLng, targetLat, targetLng].every(Number.isFinite)) {
      card.classList.remove('hidden');
      $('#trackingStatus').textContent = 'O motociclista ainda não enviou uma posição válida.';
      return;
    }

    card.classList.remove('hidden');
    if (lastRideId !== data.ride_id) {
      driverMarker = null;
      targetMarker = null;
      if (connectionLine) trackingMap.removeLayer(connectionLine);
      connectionLine = null;
      lastRideId = data.ride_id;
    }

    const driverPoint = [driverLat, driverLng];
    const targetPoint = [targetLat, targetLng];
    const bikeIcon = L.divIcon({
      className: '',
      html: '<div class="driver-marker-icon">🏍️</div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });

    if (driverMarker) driverMarker.setLatLng(driverPoint);
    else driverMarker = L.marker(driverPoint, { icon: bikeIcon, title: 'Motociclista' }).addTo(trackingMap).bindPopup('Motociclista');

    const targetLabel = data.target_type === 'destination' ? 'Destino' : 'Seu ponto de embarque';
    if (targetMarker) targetMarker.setLatLng(targetPoint).setPopupContent(targetLabel);
    else targetMarker = L.marker(targetPoint, { title: targetLabel }).addTo(trackingMap).bindPopup(targetLabel);

    if (connectionLine) connectionLine.setLatLngs([driverPoint, targetPoint]);
    else connectionLine = L.polyline([driverPoint, targetPoint], { weight: 4, opacity: .75, dashArray: '8 8' }).addTo(trackingMap);

    const bounds = L.latLngBounds([driverPoint, targetPoint]);
    trackingMap.fitBounds(bounds.pad(.28), { maxZoom: 17, animate: true });
    window.setTimeout(() => trackingMap.invalidateSize(), 100);

    const distanceKm = haversineKm(driverLat, driverLng, targetLat, targetLng);
    const updatedAt = data.location_updated_at ? new Date(data.location_updated_at) : null;
    const ageSeconds = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000)) : null;
    const stale = ageSeconds === null || ageSeconds > 30;
    const badge = $('#trackingBadge');
    badge.textContent = stale ? 'SINAL ANTIGO' : 'AO VIVO';
    badge.classList.toggle('stale', stale);
    $('#trackingStatus').textContent = stale
      ? 'A última localização está desatualizada. O motociclista pode estar sem sinal.'
      : `Atualizado há ${ageSeconds} s · precisão aproximada de ${Math.round(Number(data.accuracy_m || 0))} m`;
    $('#trackingDistanceLabel').textContent = data.target_type === 'destination' ? 'Distância até o destino' : 'Distância até você';
    $('#trackingDistance').textContent = `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
    $('#trackingEta').textContent = formatEta(distanceKm, data.ride_status);
  }

  async function refreshTracking() {
    ensureUi();
    const passengerVisible = $('#passengerView') && !$('#passengerView').classList.contains('hidden');
    if (!passengerVisible) {
      hideTracking();
      return;
    }
    const { data, error } = await trackingClient.rpc('get_active_ride_tracking');
    if (error) {
      hideTracking();
      return;
    }
    const tracking = Array.isArray(data) ? data[0] : null;
    if (!tracking) {
      hideTracking();
      return;
    }
    renderTracking(tracking);
  }

  function startPolling() {
    ensureUi();
    if (!pollTimer) pollTimer = window.setInterval(refreshTracking, 3000);
    refreshTracking();
  }

  trackingClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user) window.setTimeout(startPolling, 800);
    else hideTracking();
  });
  document.addEventListener('click', () => window.setTimeout(refreshTracking, 500));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshTracking();
  });
  window.setTimeout(startPolling, 1200);
})();
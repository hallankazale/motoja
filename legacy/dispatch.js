(() => {
  const dispatchClient = window.supabase.createClient(
    window.MOTOJA_CONFIG.supabaseUrl,
    window.MOTOJA_CONFIG.supabasePublishableKey
  );
  const $ = (selector) => document.querySelector(selector);
  let watchId = null;
  let pollTimer = null;
  let countdownTimer = null;
  let activeOffer = null;
  let lastAlertedRide = null;

  function ensureUi() {
    if (!$('#dispatchOverlay')) {
      document.body.insertAdjacentHTML('beforeend', `<section id="dispatchOverlay" class="dispatch-overlay hidden" aria-modal="true" role="dialog">
        <div class="dispatch-sheet">
          <p class="dispatch-kicker">Nova corrida próxima</p>
          <h2>Aceitar chamada?</h2>
          <div id="dispatchCountdown" class="dispatch-countdown">20</div>
          <div class="dispatch-route">
            <div class="dispatch-point"><span>Buscar passageiro</span><strong id="dispatchPickup"></strong></div>
            <div class="dispatch-point"><span>Destino</span><strong id="dispatchDestination"></strong></div>
          </div>
          <div class="dispatch-meta">
            <div><span>Até passageiro</span><strong id="dispatchPickupDistance">—</strong></div>
            <div><span>Corrida</span><strong id="dispatchRideDistance">—</strong></div>
            <div><span>Valor</span><strong id="dispatchPrice">—</strong></div>
          </div>
          <div class="dispatch-actions"><button id="dispatchDecline" class="dispatch-decline">Recusar</button><button id="dispatchAccept" class="dispatch-accept">Aceitar</button></div>
        </div>
      </section>`);
      $('#dispatchAccept').onclick = () => respond(true);
      $('#dispatchDecline').onclick = () => respond(false);
    }
    if ($('#driverApprovalText') && !$('#driverLocationStatus')) {
      $('#driverApprovalText').insertAdjacentHTML('afterend','<p id="driverLocationStatus" class="driver-location-status">Ative a disponibilidade para enviar sua localização.</p>');
    }
    if ($('#openRidesCard')) {
      $('#openRidesCard').querySelector('h3').textContent = 'Despacho automático';
      $('#openRides').innerHTML = '<p class="dispatch-waiting">As chamadas serão enviadas automaticamente conforme sua distância do passageiro.</p>';
    }
  }

  function isDriverModeVisible() {
    return $('#driverView') && !$('#driverView').classList.contains('hidden');
  }

  function setLocationStatus(text, error = false) {
    const el = $('#driverLocationStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  async function sendLocation(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const { error } = await dispatchClient.rpc('update_driver_location', {
      p_lat: latitude,
      p_lng: longitude,
      p_accuracy_m: accuracy,
    });
    setLocationStatus(error ? `GPS não enviado: ${error.message}` : `Localização ativa · precisão aproximada de ${Math.round(accuracy)} m`, Boolean(error));
    if (!error) await refreshOffer();
  }

  function startLocationWatch() {
    if (watchId !== null || !navigator.geolocation) return;
    setLocationStatus('Buscando localização do motociclista...');
    watchId = navigator.geolocation.watchPosition(
      sendLocation,
      (error) => {
        const messages = {1:'Permita a localização para receber corridas próximas.',2:'GPS indisponível no momento.',3:'O GPS demorou para responder.'};
        setLocationStatus(messages[error.code] || 'Falha ao obter GPS.', true);
      },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 }
    );
  }

  function stopLocationWatch() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  async function refreshOffer() {
    if (!isDriverModeVisible() || !$('#onlineToggle')?.checked) {
      hideOffer();
      return;
    }
    await dispatchClient.rpc('refresh_dispatch_queue');
    const { data, error } = await dispatchClient.rpc('get_driver_offer');
    if (error) return;
    const offer = Array.isArray(data) ? data[0] : null;
    if (!offer) {
      hideOffer();
      return;
    }
    showOffer(offer);
  }

  function notifyOffer(rideId) {
    if (lastAlertedRide === rideId) return;
    lastAlertedRide = rideId;
    if (navigator.vibrate) navigator.vibrate([250,120,250,120,450]);
    try {
      const audio = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(.12, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .8);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + .8);
    } catch (_) {}
  }

  function showOffer(offer) {
    ensureUi();
    activeOffer = offer;
    $('#dispatchPickup').textContent = offer.pickup_address;
    $('#dispatchDestination').textContent = offer.destination_address;
    $('#dispatchPickupDistance').textContent = `${Number(offer.distance_to_pickup_km || 0).toFixed(1)} km`;
    $('#dispatchRideDistance').textContent = `${Number(offer.distance_km || 0).toFixed(1)} km`;
    $('#dispatchPrice').textContent = Number(offer.estimated_price || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    $('#dispatchOverlay').classList.remove('hidden');
    notifyOffer(offer.ride_id);
    window.clearInterval(countdownTimer);
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((new Date(offer.offer_expires_at).getTime() - Date.now()) / 1000));
      $('#dispatchCountdown').textContent = String(seconds);
      if (seconds <= 0) {
        hideOffer();
        refreshOffer();
      }
    };
    tick();
    countdownTimer = window.setInterval(tick, 500);
  }

  function hideOffer() {
    activeOffer = null;
    window.clearInterval(countdownTimer);
    countdownTimer = null;
    $('#dispatchOverlay')?.classList.add('hidden');
  }

  async function respond(accept) {
    if (!activeOffer) return;
    const rideId = activeOffer.ride_id;
    $('#dispatchAccept').disabled = true;
    $('#dispatchDecline').disabled = true;
    const { error } = await dispatchClient.rpc('respond_driver_offer', { p_ride_id: rideId, p_accept: accept });
    $('#dispatchAccept').disabled = false;
    $('#dispatchDecline').disabled = false;
    hideOffer();
    if (error && typeof msg === 'function') msg('#appMessage', error.message, true);
    if (!error && accept && typeof loadDriver === 'function') await loadDriver();
    if (!accept) window.setTimeout(refreshOffer, 500);
  }

  function syncDriverState() {
    ensureUi();
    if (isDriverModeVisible() && $('#onlineToggle')?.checked) {
      startLocationWatch();
      if (!pollTimer) pollTimer = window.setInterval(refreshOffer, 3000);
      refreshOffer();
    } else {
      stopLocationWatch();
      window.clearInterval(pollTimer);
      pollTimer = null;
      hideOffer();
    }
  }

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'onlineToggle') window.setTimeout(syncDriverState, 300);
  });
  document.addEventListener('click', () => window.setTimeout(syncDriverState, 350));
  dispatchClient.auth.onAuthStateChange(() => window.setTimeout(syncDriverState, 700));
  window.setInterval(syncDriverState, 5000);
  window.setTimeout(syncDriverState, 1000);
})();
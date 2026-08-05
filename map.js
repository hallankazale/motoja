(() => {
  const $ = (selector) => document.querySelector(selector);
  const DEFAULT_CENTER = [-15.545, -55.162];
  let map;
  let originMarker;
  let destinationMarker;
  let routeLayer;
  let searchTimer;
  let selectedDestinationLabel = '';
  let lastSearchAt = 0;

  function setText(selector, text, error = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('error-text', error);
  }

  function coordinates(idPrefix) {
    const lat = Number($(`#${idPrefix}Lat`)?.value);
    const lng = Number($(`#${idPrefix}Lng`)?.value);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : null;
  }

  function updateRequestButton() {
    const ready = Boolean(coordinates('pickup') && coordinates('destination') && Number($('#distanceKm')?.value) > 0);
    const button = $('#requestRideButton');
    if (button) button.disabled = !ready;
  }

  function initMap() {
    if (map || !$('#rideMap') || !window.L) return;
    map = L.map('rideMap', { zoomControl: true }).setView(DEFAULT_CENTER, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    window.setTimeout(() => map.invalidateSize(), 250);
  }

  async function invokeLocation(payload) {
    const { data, error } = await client.functions.invoke('location-services', { body: payload });
    if (error) throw new Error(error.message || 'Serviço de localização indisponível');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function setOrigin(lat, lng, label, accuracy) {
    $('#pickupLat').value = String(lat);
    $('#pickupLng').value = String(lng);
    $('#pickupAddress').value = label;
    if (originMarker) originMarker.setLatLng([lat, lng]);
    else originMarker = L.marker([lat, lng], { draggable: true, title: 'Origem' }).addTo(map);
    originMarker.bindPopup('Ponto de embarque');
    originMarker.off('dragend').on('dragend', async (event) => {
      const point = event.target.getLatLng();
      try {
        const result = await invokeLocation({ action: 'reverse', lat: point.lat, lng: point.lng });
        setOrigin(point.lat, point.lng, result.label || 'Ponto selecionado no mapa');
        await calculateRoute();
      } catch (error) {
        setText('#locationStatus', error.message, true);
      }
    });
    const accuracyText = accuracy ? ` Precisão aproximada: ${Math.round(accuracy)} metros.` : '';
    setText('#locationStatus', `Origem localizada.${accuracyText} Você pode arrastar o marcador para ajustar.`);
    map.setView([lat, lng], 17);
    updateRequestButton();
  }

  async function useCurrentLocation() {
    initMap();
    const button = $('#useMyLocation');
    if (button) button.disabled = true;
    setText('#locationStatus', 'Buscando sua localização exata pelo GPS...');

    if (!navigator.geolocation) {
      setText('#locationStatus', 'Este celular não oferece geolocalização.', true);
      if (button) button.disabled = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      try {
        const result = await invokeLocation({ action: 'reverse', lat: latitude, lng: longitude });
        setOrigin(latitude, longitude, result.label || 'Minha localização', accuracy);
        await calculateRoute();
      } catch (error) {
        setOrigin(latitude, longitude, 'Minha localização', accuracy);
        setText('#locationStatus', `GPS encontrado, mas o endereço não pôde ser identificado: ${error.message}`, true);
      } finally {
        if (button) button.disabled = false;
      }
    }, (error) => {
      const messages = {
        1: 'Permissão de localização negada. Autorize o GPS no navegador.',
        2: 'Não foi possível encontrar sua localização.',
        3: 'A busca da localização demorou demais. Tente novamente.',
      };
      setText('#locationStatus', messages[error.code] || 'Falha ao acessar a localização.', true);
      if (button) button.disabled = false;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }

  function renderSuggestions(results) {
    const list = $('#destinationSuggestions');
    if (!list) return;
    if (!results.length) {
      list.innerHTML = '<div class="suggestion-empty">Nenhum endereço encontrado em Campo Verde.</div>';
      list.classList.remove('hidden');
      return;
    }
    list.innerHTML = results.map((item, index) => `<button type="button" class="suggestion-item" data-index="${index}"><strong>${escapeAddress(item.label)}</strong></button>`).join('');
    list.classList.remove('hidden');
    list.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = results[Number(button.dataset.index)];
        selectedDestinationLabel = item.label;
        $('#destinationAddress').value = item.label;
        $('#destinationLat').value = String(item.lat);
        $('#destinationLng').value = String(item.lng);
        list.classList.add('hidden');
        setDestination(item.lat, item.lng);
        await calculateRoute();
      });
    });
  }

  async function searchDestination() {
    const input = $('#destinationAddress');
    const query = input?.value.trim() || '';
    if (query === selectedDestinationLabel) return;
    $('#destinationLat').value = '';
    $('#destinationLng').value = '';
    $('#distanceKm').value = '';
    updateRequestButton();
    if (query.length < 3) {
      $('#destinationSuggestions')?.classList.add('hidden');
      setText('#routeStatus', 'Digite pelo menos 3 letras do destino.');
      return;
    }

    const wait = Math.max(0, 1050 - (Date.now() - lastSearchAt));
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
    lastSearchAt = Date.now();
    setText('#routeStatus', 'Buscando endereços próximos...');
    try {
      const data = await invokeLocation({ action: 'search', query });
      renderSuggestions(data.results || []);
      setText('#routeStatus', 'Selecione um endereço da lista.');
    } catch (error) {
      setText('#routeStatus', error.message, true);
    }
  }

  function setDestination(lat, lng) {
    initMap();
    if (destinationMarker) destinationMarker.setLatLng([lat, lng]);
    else destinationMarker = L.marker([lat, lng], { title: 'Destino' }).addTo(map);
    destinationMarker.bindPopup('Destino');
  }

  async function calculateRoute() {
    const origin = coordinates('pickup');
    const destination = coordinates('destination');
    if (!origin || !destination) {
      updateRequestButton();
      return;
    }
    setText('#routeStatus', 'Calculando a melhor rota...');
    try {
      const data = await invokeLocation({
        action: 'route',
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
      });
      $('#distanceKm').value = String(data.distanceKm);
      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = L.geoJSON(data.geometry, { style: { weight: 5, opacity: 0.8 } }).addTo(map);
      const group = L.featureGroup([originMarker, destinationMarker, routeLayer]);
      map.fitBounds(group.getBounds().pad(0.18));
      setText('#routeStatus', `${data.distanceKm.toFixed(2)} km · aproximadamente ${data.durationMinutes} min.`);
      if (typeof updateFare === 'function') await updateFare();
      updateRequestButton();
    } catch (error) {
      $('#distanceKm').value = '';
      setText('#routeStatus', error.message, true);
      updateRequestButton();
    }
  }

  function escapeAddress(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function installRideSubmit() {
    const form = $('#rideForm');
    if (!form) return;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const origin = coordinates('pickup');
      const destination = coordinates('destination');
      if (!origin || !destination) {
        msg('#appMessage', 'Confirme sua localização e selecione um destino da lista.', true);
        return;
      }
      const payload = {
        p_pickup_address: $('#pickupAddress').value.trim(),
        p_destination_address: $('#destinationAddress').value.trim(),
        p_distance_km: Number($('#distanceKm').value),
        p_payment_method: document.querySelector('input[name="paymentMethod"]:checked').value,
        p_pickup_lat: origin.lat,
        p_pickup_lng: origin.lng,
        p_destination_lat: destination.lat,
        p_destination_lng: destination.lng,
      };
      $('#requestRideButton').disabled = true;
      msg('#appMessage', 'Solicitando corrida...');
      const { data, error } = await client.rpc('create_ride', payload);
      msg('#appMessage', error ? error.message : `Corrida solicitada. Código: ${data.safety_code}`, Boolean(error));
      if (error) updateRequestButton();
      else if (typeof loadPassenger === 'function') await loadPassenger();
    };
  }

  function start() {
    initMap();
    installRideSubmit();
    $('#useMyLocation')?.addEventListener('click', useCurrentLocation);
    $('#destinationAddress')?.addEventListener('input', () => {
      selectedDestinationLabel = '';
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(searchDestination, 750);
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.autocomplete-wrap')) $('#destinationSuggestions')?.classList.add('hidden');
    });
    client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) window.setTimeout(() => {
        initMap();
        map?.invalidateSize();
        if (!coordinates('pickup')) useCurrentLocation();
      }, 700);
    });
    client.auth.getSession().then(({ data }) => {
      if (data.session?.user) window.setTimeout(() => {
        initMap();
        map?.invalidateSize();
        if (!coordinates('pickup')) useCurrentLocation();
      }, 700);
    });
  }

  start();
})();
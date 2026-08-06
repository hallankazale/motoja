(() => {
  const buildPoint = (lat, lng, address) => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      return { value: `${latitude},${longitude}`, lat: latitude, lng: longitude, precise: true };
    }
    return { value: address || 'Campo Verde, MT', lat: null, lng: null, precise: false };
  };

  const navigationLinks = (point, label) => {
    const encodedPoint = encodeURIComponent(point.value);
    const google = `https://www.google.com/maps/dir/?api=1&destination=${encodedPoint}&travelmode=driving&dir_action=navigate`;
    const waze = point.precise
      ? `https://www.waze.com/ul?ll=${point.lat}%2C${point.lng}&navigate=yes&zoom=17`
      : `https://www.waze.com/ul?q=${encodedPoint}&navigate=yes`;

    return `<section class="navigation-card" aria-label="Navegação para ${safe(label)}">
      <div class="navigation-heading">
        <span class="navigation-icon">➤</span>
        <div><strong>${safe(label)}</strong><small>${point.precise ? 'Coordenada exata enviada pelo passageiro' : 'Navegação pelo endereço informado'}</small></div>
      </div>
      <div class="navigation-actions">
        <a class="navigation-button google-navigation" href="${google}" target="_blank" rel="noopener noreferrer">Google Maps</a>
        <a class="navigation-button waze-navigation" href="${waze}" target="_blank" rel="noopener noreferrer">Waze</a>
      </div>
    </section>`;
  };

  renderDriverActive = function renderDriverActiveWithNavigation(ride) {
    const box = $('#driverActiveRide');
    if (!ride) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    box.classList.remove('hidden');
    const pickup = buildPoint(ride.pickup_lat, ride.pickup_lng, ride.pickup_address);
    const destination = buildPoint(ride.destination_lat, ride.destination_lng, ride.destination_address);
    const navigatingToPickup = ['accepted', 'driver_arriving'].includes(ride.status);
    const navigation = navigatingToPickup
      ? navigationLinks(pickup, 'Navegar até o passageiro')
      : ride.status === 'in_progress'
        ? navigationLinks(destination, 'Navegar até o destino')
        : '';

    let action = '';
    if (ride.status === 'accepted') {
      action = '<button class="primary-button" data-action="mark_driver_arriving">Confirmar saída para buscar</button>';
    }
    if (ride.status === 'driver_arriving' && !ride.arrived_at) {
      action = '<button class="primary-button" data-action="mark_driver_arrived">Cheguei ao passageiro</button>';
    }
    if (ride.status === 'driver_arriving' && ride.arrived_at && !ride.passenger_boarded_at) {
      action = '<div class="code-box"><span>Aguardando passageiro</span><strong>O passageiro precisa tocar em “Estou na moto”</strong></div>';
    }
    if (ride.status === 'driver_arriving' && ride.passenger_boarded_at) {
      action = '<div class="code-box"><span>Embarque confirmado</span><strong>Passageiro pronto</strong></div><button class="primary-button" data-action="start_ride">Iniciar corrida</button>';
    }
    if (ride.status === 'in_progress') {
      action = '<button class="primary-button" data-action="complete_ride">Finalizar corrida</button>';
    }
    if (ride.status === 'completed' && ride.payment_status === 'pending') {
      action = `<div class="code-box"><span>Valor a receber</span><strong>${money(ride.final_price || ride.estimated_price)} · ${ride.payment_method === 'pix' ? 'PIX' : 'Dinheiro'}</strong></div><button class="primary-button" data-action="confirm_ride_payment">Confirmar recebimento</button>`;
    }

    box.innerHTML = `<h2>Corrida ativa</h2>
      <div class="route-address"><span>Embarque</span><strong>${safe(ride.pickup_address)}</strong></div>
      <div class="route-address"><span>Destino</span><strong>${safe(ride.destination_address)}</strong></div>
      <div class="ride-metadata"><span>${labels[ride.status] || ride.status}</span><span>${Number(ride.distance_km || 0).toFixed(2)} km</span><span>${money(ride.final_price || ride.estimated_price)}</span></div>
      ${navigation}
      ${action}`;

    box.querySelector('[data-action]')?.addEventListener('click', (event) => {
      rideAction(event.currentTarget.dataset.action, ride.id);
    });
  };
})();
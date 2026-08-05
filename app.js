const panels = {
  request: document.querySelector('#requestPanel'),
  search: document.querySelector('#searchPanel'),
  driver: document.querySelector('#driverPanel'),
  ride: document.querySelector('#ridePanel'),
  completed: document.querySelector('#completedPanel'),
};

const destinationInput = document.querySelector('#destination');
const price = document.querySelector('#price');
const ridePrice = document.querySelector('#ridePrice');
const driverMarker = document.querySelector('#driverMarker');
let searchTimer;

function showPanel(panelName) {
  Object.values(panels).forEach((panel) => panel.classList.remove('active'));
  panels[panelName].classList.add('active');
}

function calculateDemoPrice(destination) {
  const normalizedLength = Math.max(1, destination.trim().length);
  const calculatedPrice = Math.min(24.9, 6.5 + normalizedLength * 0.25);
  return calculatedPrice.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function updateEstimate() {
  const destination = destinationInput.value;
  const estimate = calculateDemoPrice(destination || 'destino');
  price.textContent = estimate;
  ridePrice.textContent = estimate;
}

document.querySelectorAll('[data-place]').forEach((button) => {
  button.addEventListener('click', () => {
    destinationInput.value = button.dataset.place;
    updateEstimate();
  });
});

destinationInput.addEventListener('input', updateEstimate);

document.querySelector('#requestRide').addEventListener('click', () => {
  if (!destinationInput.value.trim()) {
    destinationInput.focus();
    destinationInput.setAttribute('placeholder', 'Informe um destino para continuar');
    return;
  }

  showPanel('search');
  driverMarker.classList.add('arriving');
  searchTimer = window.setTimeout(() => showPanel('driver'), 2600);
});

document.querySelector('#cancelSearch').addEventListener('click', () => {
  window.clearTimeout(searchTimer);
  driverMarker.classList.remove('arriving');
  showPanel('request');
});

document.querySelector('#startRide').addEventListener('click', () => {
  document.querySelector('#rideDestination').textContent = destinationInput.value;
  showPanel('ride');
});

document.querySelector('#finishRide').addEventListener('click', () => {
  showPanel('completed');
});

document.querySelector('#newRide').addEventListener('click', () => {
  destinationInput.value = '';
  driverMarker.classList.remove('arriving');
  updateEstimate();
  showPanel('request');
});

document.querySelectorAll('.rating button').forEach((star, index, stars) => {
  star.addEventListener('click', () => {
    stars.forEach((item, itemIndex) => {
      item.textContent = itemIndex <= index ? '★' : '☆';
    });
  });
});

updateEstimate();

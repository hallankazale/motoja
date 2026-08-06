(() => {
  const $ = (selector) => document.querySelector(selector);

  function ensureLegacyDriverControls() {
    const driverView = $('#driverView');
    if (!driverView) return;

    let compatibilityCard = $('#driverCompatibilityControls');
    if (!compatibilityCard) {
      compatibilityCard = document.createElement('section');
      compatibilityCard.id = 'driverCompatibilityControls';
      compatibilityCard.className = 'hidden';
      compatibilityCard.setAttribute('aria-hidden', 'true');
      driverView.appendChild(compatibilityCard);
    }

    if (!$('#driverApprovalText')) {
      const approvalText = document.createElement('p');
      approvalText.id = 'driverApprovalText';
      compatibilityCard.appendChild(approvalText);
    }

    if (!$('#onlineToggle')) {
      const onlineToggle = document.createElement('input');
      onlineToggle.id = 'onlineToggle';
      onlineToggle.type = 'checkbox';
      onlineToggle.addEventListener('change', () => {
        if (typeof window.toggleOnline === 'function') window.toggleOnline();
      });
      compatibilityCard.appendChild(onlineToggle);
    }

    if (!$('#driverLocationStatus')) {
      const locationStatus = document.createElement('p');
      locationStatus.id = 'driverLocationStatus';
      locationStatus.textContent = 'Ative a disponibilidade para enviar sua localização.';
      compatibilityCard.appendChild(locationStatus);
    }
  }

  ensureLegacyDriverControls();

  const observer = new MutationObserver(ensureLegacyDriverControls);
  observer.observe(document.body, { childList: true, subtree: true });

  window.setInterval(ensureLegacyDriverControls, 1000);
})();
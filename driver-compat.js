(() => {
  const $ = (selector) => document.querySelector(selector);

  function ensureElement(parent, tagName, id, configure) {
    let element = $(`#${id}`);
    if (element) return element;

    element = document.createElement(tagName);
    element.id = id;
    if (typeof configure === 'function') configure(element);
    parent.appendChild(element);
    return element;
  }

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

    ensureElement(compatibilityCard, 'p', 'driverApprovalText');

    ensureElement(compatibilityCard, 'input', 'onlineToggle', (element) => {
      element.type = 'checkbox';
      element.addEventListener('change', () => {
        if (typeof window.toggleOnline === 'function') window.toggleOnline();
      });
    });

    ensureElement(compatibilityCard, 'p', 'driverLocationStatus', (element) => {
      element.textContent = 'Ative a disponibilidade para enviar sua localização.';
    });

    // A interface moderna atualiza a aba de histórico. O app legado ainda
    // escreve em #driverRides, portanto o contêiner precisa permanecer no DOM.
    const historyParent = $('#driverTabHistory') || compatibilityCard;
    const driverRides = ensureElement(historyParent, 'div', 'driverRides');
    driverRides.classList.add('hidden');
    driverRides.setAttribute('aria-hidden', 'true');

    const openRidesParent = $('#openRidesCard') || compatibilityCard;
    ensureElement(openRidesParent, 'div', 'openRides');
  }

  ensureLegacyDriverControls();

  const observer = new MutationObserver(ensureLegacyDriverControls);
  observer.observe(document.body, { childList: true, subtree: true });

  window.setInterval(ensureLegacyDriverControls, 500);
})();
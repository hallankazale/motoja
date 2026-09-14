window.MOTOJA_CONFIG = Object.freeze({
  supabaseUrl: 'https://pgdpjhjnzcohdixqpbsx.supabase.co',
  supabasePublishableKey: 'sb_publishable_nJDQjJRs2gT8FHe9TnfeEg_9oquyMpC',
  city: 'Campo Verde',
  state: 'MT'
});

window.addEventListener('load', () => {
  if (document.querySelector('script[data-multi-role]')) return;
  const script = document.createElement('script');
  script.src = 'multi-role.js';
  script.dataset.multiRole = 'true';
  script.onload = () => {
    if (typeof currentUser !== 'undefined' && currentUser && typeof loadProfile === 'function') {
      loadProfile().catch((error) => msg('#appMessage', error.message, true));
    }
  };
  document.body.appendChild(script);
});

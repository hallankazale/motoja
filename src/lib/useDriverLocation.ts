import { useEffect, useRef } from 'react';
import { command } from './api';

/** Kept at the app root so opening a trip, support or history cannot stop tracking. */
export function useDriverLocation(enabled: boolean, onError: (message: string) => void) {
  const errorCallback = useRef(onError); errorCallback.current = onError;
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;
    let cancelled = false, lastSent = 0, sending = false;
    async function send(position: GeolocationPosition) {
      if (cancelled || sending || Date.now() - lastSent < 5000) return;
      sending = true; lastSent = Date.now();
      try { await command('location', { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, recorded_at: new Date(position.timestamp).toISOString() }); }
      catch (error) { if (!cancelled) errorCallback.current((error as Error).message); }
      finally { sending = false; }
    }
    const failed = () => { if (!cancelled) errorCallback.current('GPS indisponível. Novas chamadas serão pausadas até sua localização atualizar.'); };
    const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 };
    const watcher = navigator.geolocation.watchPosition(position => void send(position), failed, options);
    // A stationary rider still needs a fresh fix; the server expires presence after 45 seconds.
    const heartbeat = setInterval(() => { if (navigator.onLine) navigator.geolocation.getCurrentPosition(position => void send(position), failed, options); }, 15000);
    return () => { cancelled = true; clearInterval(heartbeat); navigator.geolocation.clearWatch(watcher); };
  }, [enabled]);
}

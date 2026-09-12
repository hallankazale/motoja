import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { Point } from '../domain/types';

export async function currentLocation(): Promise<Point> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location !== 'granted') throw new Error('Permita a localização nos ajustes do celular.');
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
    return { lat: position.coords.latitude, lng: position.coords.longitude, label: 'Minha localização' };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Localização não disponível neste aparelho.'));
    navigator.geolocation.getCurrentPosition(position => {
      if (position.coords.accuracy > 150) return reject(new Error('GPS impreciso. Confirme o ponto no mapa ou informe o endereço.'));
      resolve({ lat: position.coords.latitude, lng: position.coords.longitude, label: 'Minha localização' });
    }, () => reject(new Error('Não foi possível localizar você. Permita o GPS ou digite seu endereço.')), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  });
}

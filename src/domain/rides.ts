import type { RideStatus, Point } from './types.ts';

export const statusLabels: Record<RideStatus, string> = {
  requested: 'Buscando motociclista', accepted: 'Motociclista encontrado', arriving: 'A caminho de você',
  arrived: 'Seu motociclista chegou', in_progress: 'Você está em viagem', completed: 'Viagem concluída', cancelled: 'Viagem cancelada',
};
export const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const distance = (metres: number) => `${(metres / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
export const minutes = (seconds: number) => `${Math.max(1, Math.ceil(seconds / 60))} min`;
export const isActive = (status: RideStatus) => !['completed', 'cancelled'].includes(status);
export const canCancel = (status: RideStatus) => ['requested', 'accepted', 'arriving', 'arrived'].includes(status);
export const isFreshLocation = (at: string, now = Date.now()) => now - Date.parse(at) >= -10_000 && now - Date.parse(at) <= 45_000;

/** A launch service area, not a claim about the legal boundary of the municipality. */
export function inServiceArea(point: Point): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat >= -15.68 && point.lat <= -15.43 && point.lng >= -55.32 && point.lng <= -55.04;
}

/** Display-only estimate. A trip always uses a short-lived server quote in integer cents. */
export function calculateFare(metres: number, seconds: number, rule: { base_cents: number; minimum_cents: number; per_km_cents: number; per_minute_cents: number }): number {
  if (![metres, seconds, ...Object.values(rule)].every(Number.isFinite) || metres <= 0 || seconds <= 0 || metres > 80_000 || seconds > 14_400 || Object.values(rule).some(value => value < 0)) throw new Error('Tarifa ou rota inválida');
  return Math.max(rule.minimum_cents, Math.round(rule.base_cents + metres * rule.per_km_cents / 1000 + seconds * rule.per_minute_cents / 60));
}

export function validateDriver(model: string, color: string, plate: string, pixKey: string): string | null {
  if (model.trim().length < 3 || color.trim().length < 3) return 'Informe o modelo e a cor da moto.';
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate.replace(/[-\s]/g, '').toUpperCase())) return 'Confira a placa da moto.';
  if (pixKey.length > 140) return 'A chave Pix é muito longa.';
  return null;
}

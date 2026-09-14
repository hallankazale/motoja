import { createClient } from '@supabase/supabase-js';
import type { Point, Quote, Settings, Snapshot } from '../domain/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pgdpjhjnzcohdixqpbsx.supabase.co';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_nJDQjJRs2gT8FHe9TnfeEg_9oquyMpC';
export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'motoja-v2-auth' },
});

export async function command<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!navigator.onLine) throw new Error('Sem conexão. Reconecte e tente novamente.');
  const { data, error } = await supabase.rpc('mj_command', { action, payload }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw new Error(error.message.includes('Failed to fetch') ? 'Não foi possível conectar. Tente novamente.' : error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const getSnapshot = () => command<Snapshot>('snapshot');
export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.rpc('mj_public_config').abortSignal(AbortSignal.timeout(12_000));
  if (error) throw new Error('O serviço está em preparação. Tente novamente em instantes.');
  return data as Settings;
}
export async function locationService<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('motoja-locations', { body: { action, ...payload }, signal: AbortSignal.timeout(20_000) });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === 'string') message = body.error;
    }
    throw new Error(message || 'Mapas indisponíveis. Aguarde e tente novamente.');
  }
  return data as T;
}
export const searchPlaces = (query: string) => locationService<{ results: Point[]; provider?: string }>('search', { query });
export const createQuote = (pickup: Point, destination: Point) => locationService<Quote>('quote', { pickup, destination });

export async function uploadDocument(file: File, kind: string, expiresOn: string): Promise<void> {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowed.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Envie PDF, JPG ou PNG de até 5 MB.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Entre novamente para enviar o documento.');
  const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[file.type];
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('motoja-documents').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('Não foi possível enviar o documento. Tente novamente.');
  try { await command('submit_document', { kind, object_path: path, expires_on: expiresOn }); }
  catch (error) { await supabase.storage.from('motoja-documents').remove([path]); throw error; }
}

export type IntegrationStatus = { maps: { provider: string; search_configured: boolean; routing_configured: boolean }; emailConfirmation: boolean };
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const [maps, response] = await Promise.all([
    locationService<IntegrationStatus['maps']>('health', {}),
    fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey }, signal: AbortSignal.timeout(12000), cache: 'no-store' }),
  ]);
  if (!response.ok) throw new Error('Não foi possível conferir a configuração de acesso. Tente novamente.');
  const settings = await response.json();
  return { maps, emailConfirmation: settings.external?.email === true && settings.mailer_autoconfirm === false };
}

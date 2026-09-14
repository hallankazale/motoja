import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.motoja.app', appName: 'MotoJá', webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};
export default config;

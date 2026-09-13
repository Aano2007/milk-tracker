import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.milktrack.app',
  appName: 'Milk Tracker',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: true,
    },
  },
};

export default config;

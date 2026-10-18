import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.estatehold.app",
  appName: "Estatehold",
  webDir: "dist/public",
  server: {
    url: "https://estatehold-property-platform.replit.app",
    cleartext: false,
    allowNavigation: ["estatehold-property-platform.replit.app"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: "#F8F7F1",
      androidScaleType: "CENTER_INSIDE",
      showSpinner: false,
    },
  },
};

export default config;

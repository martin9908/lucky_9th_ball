import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Reverse-DNS bundle id. Change this BEFORE adding platforms if you want a
  // different one (it's baked into the native projects on `cap add`).
  appId: "com.the9ball.app",
  appName: "The 9 Ball",
  // Capacitor serves the built web assets from here — matches Vite's output.
  webDir: "dist",
};

export default config;

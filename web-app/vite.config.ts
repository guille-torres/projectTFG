import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  base: "/projectTFG/",
  root: ".",
  publicDir: "public",
  // HTTPS via self-signed cert — required for WebXR over LAN.
  // Will warn "not secure" the first time; tap advanced → proceed.
  plugins: [basicSsl()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Increase chunk warning limit: BabylonJS is large
    chunkSizeWarningLimit: 6000,

    copyPublicDir: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});

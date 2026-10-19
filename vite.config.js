import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // B-105 (L-13): bibliotecas grandes em arquivos próprios — mudam pouco,
        // ficam em cache entre deploys do código do app
        manualChunks: {
          realtime: ["socket.io-client"],
          monitoring: ["@sentry/react"],
        },
      },
    },
  },
});

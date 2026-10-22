import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // B-105 (L-13): bibliotecas grandes em arquivos próprios — mudam pouco,
        // ficam em cache entre deploys do código do app. B-86 (Vite 8): o
        // Rolldown não aceita mais o manualChunks em objeto; cada grupo pega a
        // biblioteca pelo caminho, e as dependências dela vêm junto.
        codeSplitting: {
          groups: [
            { name: "realtime", test: /node_modules[\\/]socket\.io-client[\\/]/ },
            { name: "monitoring", test: /node_modules[\\/]@sentry[\\/]react[\\/]/ },
          ],
        },
      },
    },
  },
});

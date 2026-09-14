import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Chemins relatifs : l'app est servie depuis /assets/web/ dans l'APK.
  base: './',
  plugins: [react(), tailwindcss()],
  // IPv4 explicite : adb reverse se connecte à 127.0.0.1.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});

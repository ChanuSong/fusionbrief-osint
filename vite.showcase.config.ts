import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()], base: '/trace-osint-copilot/',
  define: { 'import.meta.env.VITE_SHOWCASE': JSON.stringify('1') },
  build: { outDir: 'dist-showcase', rollupOptions: { input: 'showcase.html' } },
});

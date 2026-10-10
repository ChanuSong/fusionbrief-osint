import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5176, strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/onboarding-draft.json', '**/.local/**', '**/data/**', '**/server/**', '**/scripts/**'] },
  },
});

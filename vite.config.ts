import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  // Resolve valid Supabase URL: must be an http(s) URL
  const rawUrlCandidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ];
  const resolvedSupabaseUrl =
    rawUrlCandidates.find(
      (u) =>
        typeof u === 'string' &&
        (u.trim().startsWith('http://') || u.trim().startsWith('https://')) &&
        !u.includes('placeholder.supabase.co')
    )?.trim() || 'https://hjuyiqyviohinbhzaipl.supabase.co';

  // Resolve valid Supabase Anon / Publishable Key:
  const rawKeyCandidates = [
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.startsWith('http')
      ? process.env.VITE_SUPABASE_URL
      : undefined,
    process.env.VITE_SUPABASE_ANON_KEY,
  ];
  const resolvedSupabaseAnonKey =
    rawKeyCandidates.find(
      (k) =>
        typeof k === 'string' &&
        (k.trim().startsWith('eyJ') || k.trim().startsWith('sb_publishable_'))
    )?.trim() ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'sb_publishable_uTT8ybm0tcIb04W4cN54Tg_YujRpZQg';

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(resolvedSupabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(resolvedSupabaseAnonKey),
      'import.meta.env.SUPABASE_URL': JSON.stringify(resolvedSupabaseUrl),
      'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(resolvedSupabaseAnonKey),
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/motion')) {
              return 'vendor-motion';
            }
            if (id.includes('node_modules/leaflet')) {
              return 'vendor-leaflet';
            }
            if (id.includes('node_modules/@supabase')) {
              return 'vendor-supabase';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

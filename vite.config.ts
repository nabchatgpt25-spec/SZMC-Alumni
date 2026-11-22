import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  // Resolve valid Supabase URL from environment variables (never inject conflicting hardcoded keys)
  const rawUrlCandidates = [
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_URL,
  ];
  const resolvedSupabaseUrl =
    rawUrlCandidates.find(
      (u) =>
        typeof u === 'string' &&
        (u.trim().startsWith('http://') || u.trim().startsWith('https://')) &&
        !u.includes('placeholder.supabase.co')
    )?.trim() || '';

  // Resolve valid public Supabase Anon Key strictly from environment variables
  const rawKeyCandidates = [
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  ];
  const resolvedSupabaseAnonKey =
    rawKeyCandidates.find(
      (k) =>
        typeof k === 'string' &&
        (k.trim().startsWith('eyJ') || k.trim().startsWith('sb_publishable_'))
    )?.trim() || '';

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
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-vendor')
            ) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/hls.js')) {
              return 'vendor-video';
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

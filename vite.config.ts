import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

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
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXlpcXl2aW9oaW5iaHphaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjQ2NzIsImV4cCI6MjEwNzIwMDY3Mn0.fppNXVPWcsWGsUIBwvirhjEkdDyUCX-SyydNWExbwk8';

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
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'szmc-logo.png',
          'szmc-logo.svg',
          'ndc-logo.svg',
          'ndc-logo.png',
          'ndc-logo.jpg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'SZMC Alumni Connect',
          short_name: 'SZMC Alumni',
          description:
            'Shaheed Ziaur Rahman Medical College (SZMC Bogura) Alumni Network portal with offline cached directory, doctor lounges, and emergency blood network for 35 MBBS batches.',
          theme_color: '#1e3a8a',
          background_color: '#0b1120',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'unsplash-images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'map-tiles-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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

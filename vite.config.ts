/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

/**
 * Injects the Content-Security-Policy meta tag at build time only.
 * (Vite's dev server relies on inline scripts for HMR, so CSP is not applied in dev.)
 * GitHub Pages cannot send HTTP headers, so a meta tag is the only option there.
 */
function cspPlugin(supabaseUrl: string): Plugin {
  return {
    name: 'havenwear-csp',
    apply: 'build',
    transformIndexHtml(html) {
      let origin = ''
      try {
        origin = new URL(supabaseUrl).origin
      } catch {
        throw new Error('VITE_SUPABASE_URL must be set to a valid URL for production builds')
      }
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        // Radix + Recharts set inline style attributes; this does not allow inline scripts.
        "style-src 'self' 'unsafe-inline'",
        // Product pictures (Shopify CDN) + complaint photos (signed Supabase Storage URLs).
        `img-src 'self' data: blob: https://cdn.shopify.com ${origin}`,
        "font-src 'self'",
        // The only API the browser talks to is this Supabase project.
        `connect-src 'self' ${origin}`,
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE ?? '/havenwear-care/'
  const supabaseUrl = env.VITE_SUPABASE_URL ?? ''

  return {
    base: mode === 'test' ? '/' : base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(supabaseUrl),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Havenwear Care',
          short_name: 'HW Care',
          description: 'Customer support & complaint desk for Havenwear',
          theme_color: '#14171f',
          background_color: '#f6f6f4',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // The spreadsheet library is only needed for the admin import; load it on demand.
          globIgnores: ['**/xlsx-*.js'],
          navigateFallback: 'index.html',
          // Never cache API responses in the service worker; data caching is handled by
          // TanStack Query's persister (cleared on sign-out).
          runtimeCaching: [],
        },
      }),
    ],
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts'
            if (id.includes('node_modules/xlsx')) return 'xlsx'
            if (id.includes('node_modules/@supabase')) return 'supabase'
            return undefined
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  }
})

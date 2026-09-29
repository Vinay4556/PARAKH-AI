import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // Use the OXC-based transform (built into plugin-react v6+).
    // This replaces the old Babel-based default and eliminates the
    // "esbuild option deprecated" and "jsx invalid key" warnings from Vite 8.
    react({ babel: false }),
  ],

  build: {
    // Target modern browsers — smaller output than the default 'modules'
    target: 'es2020',

    // Inline assets smaller than 4 KB directly into JS (reduces tiny file requests)
    assetsInlineLimit: 4096,

    // Do not raise the limit; instead fix the bundle — this catches regressions
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // ── Vendor chunks (stable across releases → long-lived browser cache) ──
        manualChunks(id) {
          // React core.  react-router and @remix-run/router MUST live in the same chunk
          // as react-router-dom: otherwise vendor-react imports from vendor-misc while
          // vendor-misc imports React from vendor-react (circular chunks -> possible
          // "Cannot access 'x' before initialization" white screen in production builds).
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/@remix-run/router/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react'
          }
          // Recharts + its heavy dependencies (d3-* etc.)
          if (id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-')) {
            return 'vendor-charts'
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
          // Axios + i18n runtime (small but stable)
          if (id.includes('node_modules/axios') ||
              id.includes('node_modules/i18next') ||
              id.includes('node_modules/react-i18next')) {
            return 'vendor-i18n-axios'
          }
          // Everything else in node_modules → vendor-misc
          if (id.includes('node_modules/')) {
            return 'vendor-misc'
          }
          // Application route groups — one chunk per role (lazy imports create these automatically,
          // but the groups below keep officer/bidder/stakeholder code further separated)
          if (id.includes('/pages/officer/')) return 'pages-officer'
          if (id.includes('/pages/bidder/'))  return 'pages-bidder'
          if (id.includes('/pages/stakeholder/')) return 'pages-stakeholder'
        },
      },
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})

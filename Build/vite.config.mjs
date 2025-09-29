// vite.config.js
import { defineConfig } from "vite";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt'],
      manifest: {
        name: 'HTMLVisualizer',
        short_name: 'HTMLVisualizer',
        start_url: './',
        display: 'standalone',
        theme_color: '#00bfff',
        background_color: '#00bfff',
      },
      pwaAssets: {
        image: 'public/favicon.png',
        preset: 'minimal-2023',
        includeHtmlHeadLinks: true,
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /.*\.(js|css|html)$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'app-shell' },
          },
          {
            urlPattern: /.*\.(png|ico|json)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'assets' },
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: true,
    outDir: './dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    allowedHosts: true
  }
});
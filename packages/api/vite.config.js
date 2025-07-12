// vite.config.js

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        politician: resolve(__dirname, 'client/politician.html'),
        404: resolve(__dirname, 'client/404.html'),
      },
    },
  },
  server: {
    proxy: {
      // --- ALL YOUR API ENDPOINTS ---
      // We will handle all these endpoints with one set of debug listeners
      '/politicians': {
        // MODIFIED: Use the explicit IPv4 address
        target: 'http://127.0.0.1:3000',
        changeOrigin: true, // Recommended for proxies
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`\n[VITE PROXY] ➡️  Attempting to proxy request: ${req.method} ${req.url}`);
            console.log(`    -> to target: ${options.target}${proxyReq.path}`);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log(`[VITE PROXY] ⬅️  Received response from target for: ${req.url}`);
          });
          proxy.on('error', (err, req, res) => {
            console.error('\n[VITE PROXY] 💥 PROXY ERROR:', err);
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Proxy Error: Could not connect to the backend server.');
          });
        }
      },
      // This rule must be more specific to avoid catching /politician.js
      '/politician/': {
        // MODIFIED: Use the explicit IPv4 address
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/portraits/': {
        // MODIFIED: Use the explicit IPv4 address
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/data/': {
        // MODIFIED: Use the explicit IPv4 address
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/words': {
        // MODIFIED: Use the explicit IPv4 address
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/sentiment': {
        // MODIFIED: Use the explicit IPv4 address
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        // MODIFIED: Use the explicit IPv4 address for WebSockets too
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
    },
  },
});
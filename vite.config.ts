import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://82.70.210.206:3000',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              // Gracefully handle ECONNREFUSED when remote VPS is unreachable
              const httpRes = res as any;
              if (httpRes && !httpRes.headersSent && typeof httpRes.writeHead === 'function') {
                httpRes.writeHead(503, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-store',
                });
                httpRes.end(
                  JSON.stringify({
                    ok: false,
                    isOffline: true,
                    error: 'שרת הבוט (82.70.210.206:3000) אינו זמין כרגע. הפעל את השרת ב-VPS או השתמש במצב דמו.',
                    code: (err as any)?.code || 'ECONNREFUSED',
                  })
                );
              }
            });
          },
        },
      },
    },
  };
});

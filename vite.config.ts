import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'node:http';
import {defineConfig} from 'vite';

function apiProxyPlugin() {
  return {
    name: 'api-proxy-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api', (req: any, res: any, next: any) => {
        const targetPath = `/api${req.url || ''}`;
        const options: http.RequestOptions = {
          hostname: '82.70.210.206',
          port: 3000,
          path: targetPath,
          method: req.method,
          headers: {
            ...req.headers,
            host: '82.70.210.206:3000',
          },
          timeout: 4000,
        };

        const proxyReq = http.request(options, (proxyRes) => {
          if (!res.headersSent) {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
          }
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          if (!res.headersSent) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(
              JSON.stringify({
                ok: false,
                isOffline: true,
                error: 'פסק זמן בחיבור לשרת הבוט (82.70.210.206:3000)',
                code: 'ETIMEDOUT',
              })
            );
          }
        });

        proxyReq.on('error', (err: any) => {
          // Gracefully respond without polluting Vite logger stderr with ECONNREFUSED
          if (!res.headersSent) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(
              JSON.stringify({
                ok: false,
                isOffline: true,
                error: 'שרת הבוט (82.70.210.206:3000) אינו זמין כרגע. הפעל את השרת ב-VPS או השתמש במצב דמו.',
                code: err?.code || 'ECONNREFUSED',
              })
            );
          }
        });

        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiProxyPlugin()],
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
    },
  };
});

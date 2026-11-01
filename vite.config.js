import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Cookie-free Cloudflare Web Analytics, injected only when a beacon token is
// supplied at build time (VITE_CF_BEACON_TOKEN in .env) and only on the live host.
function analyticsPlugin() {
  return {
    name: 'meander-analytics',
    transformIndexHtml(html) {
      const token = process.env.VITE_CF_BEACON_TOKEN;
      if (!token) return html;
      const snippet = `<script>
      if (location.hostname === 'meander.clydeford.net') {
        var b = document.createElement('script'); b.defer = true;
        b.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        b.setAttribute('data-cf-beacon', '{"token": "${token}"}');
        document.head.appendChild(b);
      }
    </script>`;
      return html.replace('</head>', `${snippet}
  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [analyticsPlugin()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        debug: resolve(root, 'debug.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.js'],
  },
});

import { defineConfig } from 'vite';

// Netlify injects URL (and DEPLOY_PRIME_URL for deploy previews) during the
// build. Without it, metadata stays root-relative for local previews.
const siteUrl = (process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(
  /\/+$/,
  '',
);

export default defineConfig({
  // Pelican Rider is deployed at the Netlify domain root.
  base: '/',
  plugins: [
    {
      name: 'pelican-rider-site-url',
      transformIndexHtml(html) {
        return html.replaceAll('%SITE_URL%', siteUrl);
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
  },
});

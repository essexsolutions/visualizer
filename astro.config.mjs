import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Mount path for Webflow Cloud. Must match the mount path you set when
// connecting this repo in Webflow Cloud (e.g. yoursite.com/wave).
const BASE = '/wave';

export default defineConfig({
  base: BASE,
  // Keep Astro's default trailing-slash handling ('ignore'): the worker serves both
  // /wave and /wave/ at 200 with no redirect. This avoids a loop with Webflow Cloud,
  // which 301-strips trailing slashes at its CDN. (Do NOT prerender these pages — a
  // static /wave/index.html makes Cloudflare's asset handler 307-add the slash, which
  // Webflow then strips back, looping forever.)
  trailingSlash: 'ignore',
  build: {
    // Assets are served from the mount path on Webflow Cloud's edge.
    assetsPrefix: BASE,
  },
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});

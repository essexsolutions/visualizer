import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Mount path for Webflow Cloud. Must match the mount path you set when
// connecting this repo in Webflow Cloud (e.g. yoursite.com/wave).
const BASE = '/wave';

export default defineConfig({
  base: BASE,
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

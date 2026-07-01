# Essex Wave

Three.js wave visualizer (Omma) wrapped in a lightweight **Astro** app for hosting on
**Webflow Cloud**. Ships the main visualizer plus an **auxiliary** addon with lighter
presets and embed-friendly URL params.

- Framework: Astro 5 (`output: 'server'`) with the Cloudflare adapter (Webflow Cloud runs on Cloudflare Workers).
- Mount path: **`/wave`** — set in `astro.config.mjs` (`base` + `build.assetsPrefix`) and must match the mount path configured in Webflow Cloud.

## Requirements

- Node.js 22+
- npm

## Setup

```bash
npm install
```

## Local development

```bash
npm run dev        # http://localhost:4321/wave/
```

Edge-runtime preview (builds, then serves through Wrangler like Webflow Cloud does):

```bash
npm run preview
```

## Routes

| App | Route | Source |
|-----|-------|--------|
| **Main** (Omma) | `/wave/` | `src/pages/index.astro` → `src/scripts/main.js` |
| **Auxiliary** addon | `/wave/auxiliary/` | `src/pages/auxiliary/index.astro` → `src/scripts/auxiliary.js` |

## URL parameters

Append query strings to the app URL and reload after changing them.

### Main (`/wave/`)

| Param | Values | Example |
|-------|--------|---------|
| `controls` | `0`/`false` hide panel, `1`/`true` show | `?controls=0` |
| `preset` | Built-in name (case-insensitive), e.g. `Essex64L`, `Copper80L` | `?preset=Essex64L` |
| `fps` | `true` shows FPS overlay | `?fps=true` |

```
/wave/?controls=0&preset=Essex64L
/wave/?fps=true
```

### Auxiliary (`/wave/auxiliary/`)

| Param | Values | Example |
|-------|--------|---------|
| `controls` | `0`/`false` hide panel | `?controls=0` |
| `preset` | Built-in `Essex` or a name saved in browser localStorage | `?preset=Essex` |
| `bg` | `transparent` sets background opacity to 0 (embeds) | `?bg=transparent` |

Hash form also works (useful for some embeds): `#controls=0&preset=Essex`

```
/wave/auxiliary/?controls=0&preset=Essex
/wave/auxiliary/?bg=transparent&controls=0
```

## Deploy to Webflow Cloud

1. Push this repo to GitHub (already wired to the `essexsolutions` account).
2. In Webflow → **Webflow Cloud**, create a project and connect this repository.
3. Create an environment with the mount path **`/wave`** (must match `base` in `astro.config.mjs`).
4. Webflow Cloud builds on push and serves the app at `yoursite.com/wave/`.

Config files Webflow Cloud relies on:

| File | Purpose |
|------|---------|
| `webflow.json` | Declares the framework (`astro`) to Webflow Cloud |
| `astro.config.mjs` | Cloudflare adapter + `base`/`assetsPrefix` mount path |
| `wrangler.json` | Cloudflare Workers config for the edge runtime |
| `worker-configuration.d.ts` | Types for Worker env bindings |

### Changing the mount path

Update `BASE` in `astro.config.mjs`, keep it in sync with the Webflow Cloud environment
mount path, and update the routes/links above accordingly.

## Repo layout

```
├── astro.config.mjs           # Cloudflare adapter, base = /wave
├── webflow.json               # framework: astro
├── wrangler.json              # Cloudflare Workers config
├── worker-configuration.d.ts  # Env bindings types
├── public/                    # static passthrough assets (none required)
└── src/
    ├── pages/
    │   ├── index.astro            # /wave/
    │   └── auxiliary/index.astro  # /wave/auxiliary/
    └── scripts/
        ├── main.js                # main visualizer (Three.js)
        └── auxiliary.js           # auxiliary visualizer (Three.js)
```

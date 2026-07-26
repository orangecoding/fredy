/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as maplibre from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/**
 * Central maplibre-gl entry point for the whole UI.
 *
 * maplibre-gl v6 is ESM-only and no longer ships a default export, so consumers must not
 * `import maplibregl from 'maplibre-gl'` anymore (that binding is `undefined`).
 *
 * It also spawns its web worker from a URL derived at runtime via
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. That sibling file is never emitted
 * by our build: in dev Vite pre-bundles the dependency into `node_modules/.vite/deps/`, and in
 * the production build rollup inlines `maplibre-gl.mjs` into a hashed chunk. In both cases the
 * runtime URL resolves to a path that does not exist, the worker fails to start, and the map
 * silently never finishes loading its style (black canvas, no `load` event).
 *
 * Importing the worker through Vite's `?worker&url` makes it a real, self-contained build
 * artifact (its `maplibre-gl-shared.mjs` import is bundled in) and we point maplibre at it.
 *
 * @type {typeof import('maplibre-gl')}
 */
const maplibregl = maplibre;

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export default maplibregl;

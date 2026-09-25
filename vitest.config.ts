import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'foldkit-richtext': fileURLToPath(
        new URL('./packages/richtext/src/index.ts', import.meta.url),
      ),
      // The subpaths before the bare package, so the more specific entry wins.
      'foldkit-richtext-dom/editor': fileURLToPath(
        new URL('./packages/richtext-dom/src/editor.ts', import.meta.url),
      ),
      'foldkit-richtext-dom/editor-bundle': fileURLToPath(
        new URL('./packages/richtext-dom/src/editor-bundle.ts', import.meta.url),
      ),
      'foldkit-richtext-dom/host': fileURLToPath(
        new URL('./packages/richtext-dom/src/host.ts', import.meta.url),
      ),
      'foldkit-richtext-dom/events': fileURLToPath(
        new URL('./packages/richtext-dom/src/events.ts', import.meta.url),
      ),
      'foldkit-richtext-dom/html': fileURLToPath(
        new URL('./packages/richtext-dom/src/html.ts', import.meta.url),
      ),
      'foldkit-richtext-dom/view': fileURLToPath(
        new URL('./packages/richtext-dom/src/view.ts', import.meta.url),
      ),
      'foldkit-richtext-dom/toolbar': fileURLToPath(
        new URL('./packages/richtext-dom/src/toolbar.ts', import.meta.url),
      ),
      'foldkit-richtext-dom': fileURLToPath(
        new URL('./packages/richtext-dom/src/index.ts', import.meta.url),
      ),
      // Vite's client environment (the jsdom tests) refuses to bundle a Node
      // builtin, so a static `node:sqlite` import resolves to this shim under
      // Vitest. Node and tsx still resolve the real builtin.
      'node:sqlite': fileURLToPath(new URL('./test-support/sqlite.ts', import.meta.url)),
      // Resolve the workspace package from source, so tests never depend on a
      // prior build of packages/agent.
      'foldkit-cms-drizzle': fileURLToPath(
        new URL('./packages/cms-drizzle/src/index.ts', import.meta.url),
      ),
      'foldkit-cms': fileURLToPath(new URL('./packages/cms/src/index.ts', import.meta.url)),
      'foldkit-crud': fileURLToPath(new URL('./packages/crud/src/index.ts', import.meta.url)),
      'foldkit-agent': fileURLToPath(new URL('./packages/agent/src/index.ts', import.meta.url)),
      'foldkit-agent-native': fileURLToPath(
        new URL('./packages/agent-native/src/index.ts', import.meta.url),
      ),
      'foldkit-agent-a2a': fileURLToPath(
        new URL('./packages/agent-a2a/src/index.ts', import.meta.url),
      ),
      'foldkit-agent-mcp': fileURLToPath(
        new URL('./packages/agent-mcp/src/index.ts', import.meta.url),
      ),
      'foldkit-agent-webmcp': fileURLToPath(
        new URL('./packages/agent-webmcp/src/index.ts', import.meta.url),
      ),
      'foldkit-durable': fileURLToPath(new URL('./packages/durable/src/index.ts', import.meta.url)),
      'foldkit-sync': fileURLToPath(new URL('./packages/sync/src/index.ts', import.meta.url)),
      // Before the bare package, so the more specific entry wins.
      'foldkit-entity/conformance': fileURLToPath(
        new URL('./packages/entity/src/conformance/index.ts', import.meta.url),
      ),
      'foldkit-entity': fileURLToPath(new URL('./packages/entity/src/index.ts', import.meta.url)),
      'foldkit-form': fileURLToPath(new URL('./packages/form/src/index.ts', import.meta.url)),
      'foldkit-metadata': fileURLToPath(
        new URL('./packages/metadata/src/index.ts', import.meta.url),
      ),
      'foldkit-builder': fileURLToPath(new URL('./packages/builder/src/index.ts', import.meta.url)),
      // Before the bare package, so the more specific entry wins.
      'foldkit-composition/foldkit': fileURLToPath(
        new URL('./packages/composition/src/foldkit/index.ts', import.meta.url),
      ),
      'foldkit-composition/richtext': fileURLToPath(
        new URL('./packages/composition/src/richtext/index.ts', import.meta.url),
      ),
      'foldkit-composition': fileURLToPath(
        new URL('./packages/composition/src/index.ts', import.meta.url),
      ),
      'foldkit-surface': fileURLToPath(new URL('./packages/surface/src/index.ts', import.meta.url)),
      'foldkit-ssr': fileURLToPath(new URL('./packages/ssr/src/index.ts', import.meta.url)),
      'foldkit-primitives/interaction': fileURLToPath(
        new URL('./packages/primitives/src/interaction/index.ts', import.meta.url),
      ),
      'foldkit-primitives/state': fileURLToPath(
        new URL('./packages/primitives/src/state/index.ts', import.meta.url),
      ),
      'foldkit-primitives/time': fileURLToPath(
        new URL('./packages/primitives/src/time/index.ts', import.meta.url),
      ),
      'foldkit-bundle': fileURLToPath(new URL('./packages/bundle/src/index.ts', import.meta.url)),
      'foldkit-react': fileURLToPath(new URL('./packages/react/src/index.ts', import.meta.url)),
      'foldkit-react-codegen': fileURLToPath(
        new URL('./packages/react-codegen/src/index.ts', import.meta.url),
      ),
      'foldkit-bundle-surface': fileURLToPath(
        new URL('./packages/bundle-surface/src/index.ts', import.meta.url),
      ),
      'foldkit-mirror': fileURLToPath(new URL('./packages/mirror/src/index.ts', import.meta.url)),
      'foldkit-remote': fileURLToPath(new URL('./packages/remote/src/index.ts', import.meta.url)),
      'foldkit-remote-server': fileURLToPath(
        new URL('./packages/remote-server/src/index.ts', import.meta.url),
      ),
      'foldkit-remote-drizzle': fileURLToPath(
        new URL('./packages/remote-drizzle/src/index.ts', import.meta.url),
      ),
      // The subpaths before the bare package, so the more specific entry wins.
      'foldkit-mixins/theme': fileURLToPath(
        new URL('./packages/mixins/src/theme.ts', import.meta.url),
      ),
      'foldkit-mixins/layers': fileURLToPath(
        new URL('./packages/mixins/src/layers.ts', import.meta.url),
      ),
      'foldkit-mixins/layout': fileURLToPath(
        new URL('./packages/mixins/src/layout.ts', import.meta.url),
      ),
      'foldkit-mixins/defaults': fileURLToPath(
        new URL('./packages/mixins/src/defaults.ts', import.meta.url),
      ),
      'foldkit-mixins/prose': fileURLToPath(
        new URL('./packages/mixins/src/prose.ts', import.meta.url),
      ),
      'foldkit-mixins': fileURLToPath(new URL('./packages/mixins/src/index.ts', import.meta.url)),
      'foldkit-mixins-surface': fileURLToPath(
        new URL('./packages/mixins-surface/src/index.ts', import.meta.url),
      ),
      'foldkit-mixins-crud': fileURLToPath(
        new URL('./packages/mixins-crud/src/index.ts', import.meta.url),
      ),
      'foldkit-mixins-form': fileURLToPath(
        new URL('./packages/mixins-form/src/index.ts', import.meta.url),
      ),
      'foldkit-mixins-richtext': fileURLToPath(
        new URL('./packages/mixins-richtext/src/index.ts', import.meta.url),
      ),
      'foldkit-mixins-ui': fileURLToPath(
        new URL('./packages/mixins-ui/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
  },
})

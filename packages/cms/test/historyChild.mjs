/**
 * Prints `historyRender.ts`'s markup beside this process's default locale and
 * zone, for `history.test.ts`. It loads through a Vite server resolved as
 * Vitest resolves, with `pnpm mutate`'s plugin, so a mutation of the card
 * reaches this process.
 */
import { createServer, createServerModuleRunner } from 'vite'

import { mutation } from '../../../scripts/mutation-plugin.mjs'
import { alias, inNode } from '../../../scripts/test-resolve.mjs'

const server = await createServer({
  configFile: false,
  root: import.meta.dirname,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [mutation()],
  resolve: { conditions: inNode, alias },
  ssr: { resolve: { conditions: inNode } },
})
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
try {
  const { render } = await runner.import('./historyRender.ts')
  const defaults = new Intl.DateTimeFormat().resolvedOptions()
  process.stdout.write(
    JSON.stringify({ locale: defaults.locale, timeZone: defaults.timeZone, html: await render() }),
  )
} finally {
  await runner.close()
  await server.close()
}

/**
 * The page on Vite, with `/remote` sent to a Worker, as the deployed page's
 * `_worker.js` sends it. `pnpm dev` and the e2e test serve it the same way.
 */
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export const servePage = async (worker: string, port: number) => {
  const vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: { '/remote': { target: worker } } },
  })
  await vite.listen()
  return vite
}

/**
 * `pnpm run server`: the journal in a file beside the example, so pages outlive the server,
 * on the port the Vite dev server proxies `/sync` to.
 */
import { fileURLToPath } from 'node:url'
import { openJournal } from './journal.js'
import { startPagesServer } from './server.js'

const journal = openJournal(fileURLToPath(new URL('../pages.sqlite', import.meta.url)))
const server = await startPagesServer({ journal, port: Number(process.env['SYNC_PORT'] ?? 8787) })
console.log(`Sync server on ${server.url}`)

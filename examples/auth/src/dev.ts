/**
 * `pnpm dev`: the server and Vite together. Vite proxies `/auth` and
 * `/remote` to the server. Sessions and notes are in memory, so a restart
 * signs everyone out.
 */
import { spawn } from 'node:child_process'
import { DEV_ORIGIN, SERVER_PORT } from '../vite.config.js'
import { startHttpServer } from './http.js'

const server = await startHttpServer(SERVER_PORT, DEV_ORIGIN)
console.log(`auth and remote server on ${server.url}; open ${DEV_ORIGIN}`)

const vite = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

vite.on('close', code => {
  void server.close().then(() => process.exit(code ?? 0))
})
process.on('SIGINT', () => {
  void server.close().then(() => process.exit(0))
})

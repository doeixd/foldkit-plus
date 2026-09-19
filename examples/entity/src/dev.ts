/**
 * `pnpm dev`: the SQLite-backed server and Vite together. Vite proxies `/remote`
 * to the server. The database is in memory, so a restart resets the data.
 */
import { spawn } from 'node:child_process'
import { startHttpServer } from './http.js'

const server = await startHttpServer(Number(process.env['REMOTE_PORT'] ?? 8788))
console.log(`remote server on ${server.url}`)

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

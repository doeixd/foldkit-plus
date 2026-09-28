/**
 * The second half of `pnpm build`, after Vite: each page in `prerenderPaths`
 * written into the build's output where a static host serves it
 * (`/about` as `about/index.html`).
 */
import { Effect } from 'effect'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { generatePages } from './entry.server.js'

const out = process.argv[2] ?? 'dist'
const pages = await Effect.runPromise(
  generatePages(await readFile(join(out, 'index.html'), 'utf8')),
)
for (const page of pages) {
  const file = join(out, page.file)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, page.html)
}
console.log(`prerendered ${pages.map(page => page.path).join(', ')} into ${out}`)

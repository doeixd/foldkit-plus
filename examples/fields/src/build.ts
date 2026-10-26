/** Writes the gallery's pages to `dist/`: `pnpm build` runs it. */
import { Effect } from 'effect'
import { mkdirSync, writeFileSync } from 'node:fs'
import { gallery } from './gallery.js'
import { read } from './read.js'
import { pages } from './render.js'

const out = new URL('../dist/', import.meta.url)
mkdirSync(out, { recursive: true })
for (const [name, html] of await Effect.runPromise(pages(gallery.map(read)))) {
  writeFileSync(new URL(name, out), html)
  console.log(`wrote dist/${name}`)
}

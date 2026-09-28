/**
 * The second half of `pnpm build:sandbox`, after Vite: the site's pages,
 * rendered from the seed into the built `index.html` (`prerender.ts`), with
 * the sitemap and `robots.txt`, written into the build's output.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SSR } from 'foldkit-ssr'
import { ORIGIN } from '../content/domain.js'
import { generateSite, siteTemplate } from './prerender.js'

const out = process.argv[2] ?? 'dist'
const pages = await generateSite(siteTemplate(await readFile(join(out, 'index.html'), 'utf8')))
for (const page of pages) {
  const file = join(out, page.file)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, page.html)
}
await writeFile(join(out, 'sitemap.xml'), SSR.sitemap(pages, { origin: ORIGIN }))
await writeFile(join(out, 'robots.txt'), SSR.robots({ origin: ORIGIN }))
console.log(`generated ${pages.length} pages, a sitemap and robots.txt into ${out}`)

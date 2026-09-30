/**
 * Renders the site for the determinism check: prints the process's default
 * locale and every generated page as JSON, so the parent test can compare
 * two environments. Run under tsx from examples/cms (its tsconfig paths
 * resolve workspace packages to source). `FOLDKIT_BUILD_ID` must be set.
 */
import { readFileSync } from 'node:fs'
import { generateSite, siteTemplate } from '../src/ssr/prerender.js'

const template = siteTemplate(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))
// The parent fixes the build clock so only ambient reads can move the output.
const at = process.env['DETERMINISM_NOW']
if (at === undefined)
  throw new Error('determinismChild runs under the determinism test (DETERMINISM_NOW)')
const pages = await generateSite(template, new Date(at))
process.stdout.write(
  JSON.stringify({
    locale: new Intl.DateTimeFormat().resolvedOptions().locale,
    pages: pages.map(page => ({ path: page.path, html: page.html })),
  }),
)

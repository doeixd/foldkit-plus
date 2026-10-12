/**
 * `pnpm --filter foldkit-example-site api`: writes `generated/api/<dir>.json`
 * for every published package, from its entry points' declarations. Each file
 * is decoded with the site's own schema before it is written.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Option } from 'effect'

import { compilerOptionsOf, extract, packageSource } from '../src/api/extract.js'
import { decodeApi, encodeApi } from '../src/api/model.js'

const root = join(import.meta.dirname, '../../..')
const out = join(import.meta.dirname, '../generated/api')
const started = performance.now()

const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(entry => Option.toArray(packageSource(join(root, 'packages', entry.name))))

const api = await extract(root, packages, compilerOptionsOf(root))

mkdirSync(out, { recursive: true })
for (const source of api) {
  const json = JSON.stringify(encodeApi(source), null, 2)
  decodeApi(JSON.parse(json))
  writeFileSync(join(out, `${source.dir}.json`), `${json}\n`)
  const exports = source.modules.reduce((sum, module) => sum + module.exports.length, 0)
  console.log(`${source.name}: ${source.modules.length} modules, ${exports} exports`)
}
console.log(`${api.length} packages in ${((performance.now() - started) / 1000).toFixed(1)}s`)

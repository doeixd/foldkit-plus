/**
 * Runs a round-robin shard of `pnpm e2e` (`node scripts/e2e-shard.mjs <index> <total>`).
 *
 * Vitest's `--shard` takes contiguous alphabetical slices, which piles heavy
 * directories (`examples/cms`, `examples/foldkit/domains-plus`) into the first
 * shards while the last shard runs only light widget checks. Dealing sorted
 * files round-robin (`i % total === index - 1`) balances wall time across
 * shards and automatically picks up every new `*.e2e.ts` file.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const index = Number(process.argv[2])
const total = Number(process.argv[3])
if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
  console.error('usage: node scripts/e2e-shard.mjs <1..total> <total>')
  process.exit(2)
}

const EXCLUDED = new Set([
  'examples/site/e2e/adoption.e2e.ts',
  'examples/foldkit/domains-plus/e2e/layoutShift.e2e.ts',
])

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.'))
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.e2e.ts')) {
      const rel = relative(root, full).replaceAll('\\', '/')
      if (!EXCLUDED.has(rel)) out.push(rel)
    }
  }
  return out
}

const all = walk(join(root, 'examples')).sort()
const shard = all.filter((_, at) => at % total === index - 1)
if (shard.length === 0) process.exit(0)

console.log(`e2e shard ${index}/${total}: ${shard.length} of ${all.length} files`)
for (const file of shard) console.log(`  - ${file}`)

const result = spawnSync('pnpm', ['e2e', ...shard], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)

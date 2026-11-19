/**
 * Shared built entry (`dist/index.js`) for `mixins-ui`'s tree-shaking and
 * build-output tests. Reuses a fresh `packages/mixins-ui/dist` (always fresh
 * in CI's `builds` job) or builds once under a lock into `.tsbuild/shared-ui/dist`
 * instead of running `tsdown` ten times across seven test files.
 *
 * Under `pnpm mutate` (`FOLDKIT_MUTATION` set), always builds once per process
 * from the in-memory mutated config/sources so `treeShaking.mutations.ts` sees
 * every edit.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPackage } from 'tsdown'
import config from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
const tsbuild = join(packageDir, '.tsbuild')

const newestMtime = (target: string): number => {
  if (!existsSync(target)) return -Infinity
  const info = statSync(target)
  if (!info.isDirectory()) return info.mtimeMs
  let newest = -Infinity
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const mtime = newestMtime(join(target, entry.name))
    if (mtime > newest) newest = mtime
  }
  return newest
}

const sourceMtime = () =>
  Math.max(
    newestMtime(join(packageDir, 'src')),
    newestMtime(join(packageDir, 'package.json')),
    newestMtime(join(packageDir, 'tsdown.config.ts')),
  )

const isFreshFile = (file: string) => {
  const info = statSync(file, { throwIfNoEntry: false })
  return info !== undefined && info.mtimeMs >= sourceMtime()
}

const acquireLock = async (lockDir: string): Promise<() => void> => {
  const deadline = Date.now() + 120_000
  while (true) {
    try {
      mkdirSync(lockDir)
      return () => rmSync(lockDir, { recursive: true, force: true })
    } catch {
      const age = Date.now() - (statSync(lockDir, { throwIfNoEntry: false })?.mtimeMs ?? Date.now())
      if (age > 120_000) {
        rmSync(lockDir, { recursive: true, force: true })
        continue
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${lockDir}`)
      await new Promise(done => setTimeout(done, 150))
    }
  }
}

let cachedEntry: Promise<string> | undefined

/** Absolute path to a fresh `dist/index.js` of `foldkit-mixins-ui`. */
export const builtUiEntry = (): Promise<string> => {
  cachedEntry ??= (async () => {
    mkdirSync(tsbuild, { recursive: true })
    if (process.env['FOLDKIT_MUTATION'] !== undefined) {
      const tmp = mkdtempSync(join(tsbuild, 'mut-ui-'))
      const dist = join(tmp, 'dist')
      await buildPackage({
        ...config,
        config: false,
        cwd: packageDir,
        outDir: dist,
        dts: false,
        logLevel: 'silent',
      })
      process.once('exit', () => rmSync(tmp, { recursive: true, force: true }))
      return join(dist, 'index.js')
    }

    const publishedEntry = join(packageDir, 'dist', 'index.js')
    if (isFreshFile(publishedEntry)) return publishedEntry

    const sharedRoot = join(tsbuild, 'shared-ui')
    const sharedDist = join(sharedRoot, 'dist')
    const sharedEntry = join(sharedDist, 'index.js')
    const ready = join(sharedRoot, '.ready')
    if (existsSync(sharedEntry) && isFreshFile(ready)) return sharedEntry

    const release = await acquireLock(join(tsbuild, 'shared-ui.lock'))
    try {
      if (!existsSync(sharedEntry) || !isFreshFile(ready)) {
        rmSync(ready, { force: true })
        await buildPackage({
          ...config,
          config: false,
          cwd: packageDir,
          outDir: sharedDist,
          dts: false,
          logLevel: 'silent',
        })
        writeFileSync(ready, '')
      }
      return sharedEntry
    } finally {
      release()
    }
  })()
  return cachedEntry
}

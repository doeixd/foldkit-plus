// @vitest-environment node
/**
 * When the bundle report rebuilds a package's `dist` (#463): a `dist` older
 * than its source is stale, and one that is current or missing decides as the
 * mtimes say.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { isStale } from '../bundle-report.mjs'

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1) + seconds * 1000)

const place = (file: string, time: Date) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, 'export {}\n')
  utimesSync(file, time, time)
}

const packageWith = (times: { src: Date; dist?: Date; manifest?: Date }) => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-stale-'))
  made.push(dir)
  place(join(dir, 'package.json'), times.manifest ?? at(0))
  place(join(dir, 'src', 'a.ts'), times.src)
  if (times.dist !== undefined) place(join(dir, 'dist', 'a.js'), times.dist)
  return dir
}

test('a dist newer than its source is current', () => {
  expect(isStale(packageWith({ src: at(1), dist: at(2) }))).toBe(false)
})

test('a source file touched after the dist makes it stale', () => {
  const dir = packageWith({ src: at(1), dist: at(2) })
  utimesSync(join(dir, 'src', 'a.ts'), at(3), at(3))
  expect(isStale(dir)).toBe(true)
})

test('a package.json newer than the dist makes it stale', () => {
  expect(isStale(packageWith({ src: at(1), dist: at(2), manifest: at(3) }))).toBe(true)
})

test('a missing dist is stale', () => {
  expect(isStale(packageWith({ src: at(1) }))).toBe(true)
})

test('node_modules under src does not count as source', () => {
  const dir = packageWith({ src: at(1), dist: at(2) })
  place(join(dir, 'src', 'node_modules', 'dep', 'index.js'), at(9))
  expect(isStale(dir)).toBe(false)
})

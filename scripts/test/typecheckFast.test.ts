// @vitest-environment node
/**
 * `typecheck:fast` on two fixture projects, one clean and one with a type
 * error: the error must reach the exit status, not only the output.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const fast = (...projects: string[]) => {
  const result = spawnSync('node', ['scripts/typecheck-fast.mjs', ...projects], {
    cwd: root,
    encoding: 'utf8',
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

test('a clean project exits 0 and says it is only a look', () => {
  const { status, output } = fast('scripts/test/fixture/typed-ok')
  expect(output).toMatch(/not the verdict/)
  expect(status).toBe(0)
}, 120_000)

test('a type error exits 1 and is printed', () => {
  const { status, output } = fast('scripts/test/fixture/typed-bad')
  expect(output).toMatch(/typed-bad\/a\.ts\(1,14\): error TS2322/)
  expect(status).toBe(1)
}, 120_000)

test('a folder with no tsconfig exits 2 without running anything', () => {
  const { status, output } = fast('scripts/test/fixture')
  expect(output).toMatch(/has no tsconfig\.json/)
  expect(status).toBe(2)
}, 120_000)

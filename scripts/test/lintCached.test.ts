// @vitest-environment node
/**
 * The table behind `pnpm lint:cached`: every check is a real package script,
 * and every input it names exists, so a renamed script or folder cannot leave
 * a check cached on nothing.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { argumentsFor, checks } from '../lint-cached.mjs'

const root = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

test.each(Object.entries(checks))(
  '%s runs a package script, and each input it names exists',
  (name, check) => {
    expect(manifest.scripts[check.script]).toBeDefined()
    for (const input of check.inputs) {
      const listed = spawnSync('git', ['ls-files', '--', input], { cwd: root, encoding: 'utf8' })
      expect(listed.stdout.trim(), `${name}: ${input} matches no tracked file`).not.toBe('')
    }
    expect(argumentsFor(name as keyof typeof checks).slice(-3)).toEqual([
      'pnpm',
      '-s',
      check.script,
    ])
  },
)

test('every check the repository CI runs by hand is in the table', () => {
  const scripts = Object.values(checks).map(check => check.script)
  expect(scripts).toEqual(
    expect.arrayContaining([
      'tags:check',
      'rtl:check',
      'writes:check',
      'icons:check',
      'paths:check',
      'mutate:check',
      'docs:check',
      'format:check',
    ]),
  )
})

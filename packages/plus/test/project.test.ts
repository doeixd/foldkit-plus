// @vitest-environment node
/** What the CLI reads from a project's folder and the folders above it. */
import { Option } from 'effect'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'

import { projectIn } from '../src/project.js'

const root = mkdtempSync(join(tmpdir(), 'foldkit-plus-project-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const gitattributesIn = (folder: string) =>
  Option.map(projectIn(folder), project => project.gitattributes)

test("a `.gitattributes` counts at the repository's root, and not above it", () => {
  // outside/.gitattributes > repo/.git > repo/app/package.json
  const outside = join(root, 'outside')
  const repo = join(outside, 'repo')
  const app = join(repo, 'app')
  mkdirSync(join(repo, '.git'), { recursive: true })
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app' }))
  writeFileSync(join(outside, '.gitattributes'), '* text=auto eol=lf\n')

  expect(gitattributesIn(app)).toEqual(Option.some(false))
  writeFileSync(join(repo, '.gitattributes'), '* text=auto eol=lf\n')
  expect(gitattributesIn(app)).toEqual(Option.some(true))
})

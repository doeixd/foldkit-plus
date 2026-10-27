// @vitest-environment node
/** What the CLI reads from a project's folder and the folders above it. */
import { Option } from 'effect'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it, test } from 'vitest'

import { Refusal, libraryIn, projectIn } from '../src/project.js'

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

describe('libraryIn', () => {
  // app/node_modules/foldkit-plus links into pnpm's store, where its own
  // dependencies sit beside it and nowhere the project's folder reaches.
  const app = join(root, 'library', 'app')
  const store = join(app, 'node_modules', '.pnpm', 'foldkit-plus@1.0.0', 'node_modules')
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  const manifest = (name: string, version: string, dependencies = {}) =>
    JSON.stringify({ name, version, dependencies })
  write(join(app, 'package.json'), manifest('app', '0.0.0', { 'foldkit-plus': '1.0.0' }))
  write(
    join(store, 'foldkit-plus', 'package.json'),
    manifest('foldkit-plus', '1.0.0', { 'foldkit-remote': '2.0.0' }),
  )
  write(join(store, 'foldkit-plus', 'README.md'), '# Plus\n')
  write(
    join(store, 'foldkit-plus', 'dist', 'remote.d.mts'),
    '/** A copy. */\ndeclare const Remote: {};\n',
  )
  write(join(store, 'foldkit-remote', 'package.json'), manifest('foldkit-remote', '2.0.0'))
  write(join(store, 'foldkit-remote', 'README.md'), '# Remote\n\n## Preload\n')
  write(
    join(store, 'foldkit-remote', 'dist', 'chunks', 'index-x.d.mts'),
    '/** The one. */\ndeclare const Remote: {};\n',
  )
  symlinkSync(join(store, 'foldkit-plus'), join(app, 'node_modules', 'foldkit-plus'), 'junction')
  // An older copy above the project, which the app's own imports would reach
  // but `foldkit-plus`'s do not.
  write(
    join(root, 'library', 'node_modules', 'foldkit-remote', 'package.json'),
    manifest('foldkit-remote', '0.0.1'),
  )
  const skill = join(app, '.agents', 'skills', 'foldkit-plus')
  write(
    join(skill, 'SKILL.md'),
    "---\nname: foldkit-plus\nmetadata:\n  version: '0.9.0'\n---\n# Skill\n",
  )
  write(join(skill, 'references', 'remote.md'), '# Remote reference\n')

  it("reads the installed packages' READMEs, through the link, and the project's skill", () => {
    const { docs } = libraryIn(app, [])
    expect(docs.map(doc => [doc.topic, doc.label])).toEqual([
      ['skill', 'foldkit-plus skill 0.9.0 SKILL.md'],
      ['remote', 'foldkit-plus skill 0.9.0 references/remote.md'],
      ['plus', 'foldkit-plus@1.0.0 README.md'],
      ['remote', 'foldkit-remote@2.0.0 README.md'],
    ])
    expect(docs[3]!.text).toContain('## Preload')
  })

  it("looks a symbol up in each package's types, not in foldkit-plus's copies", () => {
    const found = libraryIn(app, []).declarations('Remote')
    expect(found.map(each => [each.origin, each.comment])).toEqual([
      ['foldkit-remote@2.0.0', ['/** The one. */']],
    ])
    expect(found[0]!.path).toBe(
      join(realpathSync(store), 'foldkit-remote', 'dist', 'chunks', 'index-x.d.mts'),
    )
  })

  it('refuses a package the project names but has not installed', () => {
    write(
      join(app, 'package.json'),
      manifest('app', '0.0.0', { 'foldkit-plus': '1.0.0', 'foldkit-sync': '1.0.0' }),
    )
    try {
      // One the CLI knows of and the project does not name is no fault.
      expect(() => libraryIn(app, ['foldkit-mirror'])).not.toThrow()
      expect(() => libraryIn(app, ['foldkit-sync'])).toThrow(
        new Refusal(
          `package.json names foldkit-sync, but it is not installed in ${app}: run the install first.`,
        ),
      )
    } finally {
      write(join(app, 'package.json'), manifest('app', '0.0.0', { 'foldkit-plus': '1.0.0' }))
    }
  })

  it('refuses a folder with no project, and a project with nothing installed', () => {
    const bare = join(root, 'bare')
    mkdirSync(bare, { recursive: true })
    expect(() => libraryIn(bare, [])).toThrow(/There is no package.json in/)
    writeFileSync(join(bare, 'package.json'), manifest('bare', '0.0.0'))
    expect(() => libraryIn(bare, ['foldkit-remote'])).toThrow(
      /No Foldkit Plus package is installed in/,
    )
  })
})

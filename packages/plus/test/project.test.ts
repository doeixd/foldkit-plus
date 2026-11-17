// @vitest-environment node
/** What the CLI reads from a project's folder and the folders above it. */
import { Option } from 'effect'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it, test } from 'vitest'

import { Refusal, installSkill, libraryIn, projectIn } from '../src/project.js'

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

test("npm's locked Effect versions are read from the root's lockfile, nested copies included", () => {
  // repo/.git > repo/package-lock.json > repo/apps/web/package.json
  const repo = join(root, 'locked')
  const app = join(repo, 'apps', 'web')
  const lockedIn = (folder: string) => Option.map(projectIn(folder), project => project.locked)
  mkdirSync(join(repo, '.git'), { recursive: true })
  mkdirSync(app, { recursive: true })
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'web' }))
  expect(lockedIn(app)).toEqual(Option.some([]))

  const packages = {
    '': { name: 'top' },
    'node_modules/effect': { version: '4.1.0' },
    'node_modules/@foldkit/vite-plugin': { version: '0.29.0' },
    'node_modules/@foldkit/vite-plugin/node_modules/@effect/platform-node': { version: '4.1.1' },
    'node_modules/effect-oxlint': { version: '0.4.0' },
    'node_modules/@effect/tsgo': { version: '0.50.0' },
  }
  writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({ packages }))
  expect(lockedIn(app)).toEqual(Option.some(['4.1.0', '4.1.1']))

  writeFileSync(join(repo, 'package-lock.json'), '{ not json')
  expect(lockedIn(app)).toEqual(Option.some([]))
})

describe("where pnpm reads a project's settings", () => {
  const settingsIn = (folder: string) => Option.map(projectIn(folder), each => each.pnpmSettings)
  const workspace = (name: string, rootManifest: object) => {
    const top = join(root, name)
    const app = join(top, 'apps', 'web')
    mkdirSync(join(top, '.git'), { recursive: true })
    mkdirSync(app, { recursive: true })
    writeFileSync(join(top, 'package.json'), JSON.stringify(rootManifest))
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'web' }))
    return { top, app }
  }

  it("is a standalone project's own `package.json`", () => {
    const { app } = workspace('standalone', { name: 'top' })
    expect(settingsIn(app)).toEqual(Option.some({ folder: '.', file: 'package.json' }))
  })

  it("is a workspace root's `pnpm-workspace.yaml`, at or above the member", () => {
    const { top, app } = workspace('yaml', { name: 'top' })
    writeFileSync(join(top, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")
    expect(settingsIn(app)).toEqual(Option.some({ folder: '../..', file: 'pnpm-workspace.yaml' }))
    expect(settingsIn(top)).toEqual(Option.some({ folder: '.', file: 'pnpm-workspace.yaml' }))
  })

  it("is the root's `package.json` where its `pnpm` field already holds settings", () => {
    const { top, app } = workspace('field', { name: 'top', pnpm: { overrides: {} } })
    writeFileSync(join(top, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")
    expect(settingsIn(app)).toEqual(Option.some({ folder: '../..', file: 'package.json' }))
  })
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
  // What the package ships: a skill at 1.2.0 and a guide.
  write(
    join(store, 'foldkit-plus', 'skill', 'SKILL.md'),
    "---\nname: foldkit-plus\nmetadata:\n  version: '1.2.0'\n---\n# Shipped skill\n",
  )
  write(join(store, 'foldkit-plus', 'skill', 'references', 'remote.md'), '# Shipped remote\n')
  write(join(store, 'foldkit-plus', 'guides', 'wiring.md'), '# Wiring\n\n## Seams\n')
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

  it("reads the installed packages' READMEs, through the link, and the skill and guides they ship", () => {
    const { docs } = libraryIn(app, [])
    expect(docs.map(doc => [doc.topic, doc.label])).toEqual([
      ['skill', 'foldkit-plus@1.0.0 skill SKILL.md'],
      ['remote', 'foldkit-plus@1.0.0 skill references/remote.md'],
      ['wiring', 'foldkit-plus@1.0.0 guide wiring.md'],
      ['plus', 'foldkit-plus@1.0.0 README.md'],
      ['remote', 'foldkit-remote@2.0.0 README.md'],
    ])
    expect(docs[4]!.text).toContain('## Preload')
    // The project's own, older skill is not mixed in.
    expect(docs.map(doc => doc.text).join('\n')).not.toContain('# Remote reference')
  })

  it("answers from the shipped skill, not the project's, and says which is newer", () => {
    const skillFile = join(skill, 'SKILL.md')
    const versioned = (version: string) =>
      `---\nname: foldkit-plus\nmetadata:\n  version: '${version}'\n---\n`
    try {
      expect(libraryIn(app, []).notes).toEqual([
        expect.stringContaining(
          'The skill in .agents/skills/foldkit-plus is 0.9.0, older than the 1.2.0 that ships with foldkit-plus@1.0.0',
        ),
      ])
      writeFileSync(skillFile, versioned('2.0.0'))
      expect(libraryIn(app, []).notes).toEqual([
        expect.stringContaining('is 2.0.0, newer than the 1.2.0'),
      ])
      writeFileSync(skillFile, versioned('1.2.0'))
      expect(libraryIn(app, []).notes).toEqual([])
    } finally {
      writeFileSync(skillFile, versioned('0.9.0') + '# Skill\n')
    }
  })

  it("falls back to the CLI's own skill when the project's foldkit-plus ships none", () => {
    const own = join(root, 'own-copy')
    write(join(own, 'package.json'), manifest('foldkit-plus', '3.0.0'))
    write(
      join(own, 'skill', 'SKILL.md'),
      "---\nname: foldkit-plus\nmetadata:\n  version: '3.1.0'\n---\n",
    )
    const bare = join(root, 'library', 'bare-app')
    write(join(bare, 'package.json'), manifest('bare-app', '0.0.0', { 'foldkit-remote': '2.0.0' }))
    write(
      join(bare, 'node_modules', 'foldkit-remote', 'package.json'),
      manifest('foldkit-remote', '2.0.0'),
    )
    expect(libraryIn(bare, ['foldkit-remote'], own).docs.map(doc => doc.label)).toContain(
      'foldkit-plus@3.0.0 skill SKILL.md',
    )
    // The installed one is for the code in use, so the CLI's copy never outranks it.
    expect(libraryIn(app, [], own).docs.map(doc => doc.label)).not.toContain(
      'foldkit-plus@3.0.0 skill SKILL.md',
    )
    expect(libraryIn(bare, ['foldkit-remote']).docs.map(doc => doc.label)).not.toContain(
      'foldkit-plus@3.0.0 skill SKILL.md',
    )
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
    expect(() => libraryIn(bare, ['foldkit-remote'])).toThrow(/There is no package.json in/)
    writeFileSync(join(bare, 'package.json'), manifest('bare', '0.0.0'))
    expect(() => libraryIn(bare, ['foldkit-remote'])).toThrow(
      /No Foldkit Plus package is installed in/,
    )
  })
})

describe('installSkill', () => {
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  const skillText = (version: string, name = 'foldkit-plus') =>
    `---\nname: ${name}\nmetadata:\n  version: '${version}'\n---\n# Skill ${version}\n`
  const project = (name: string, shippedVersion: string) => {
    const app = join(root, 'install', name)
    write(
      join(app, 'package.json'),
      JSON.stringify({ name, dependencies: { 'foldkit-plus': '1.0.0' } }),
    )
    const plus = join(app, 'node_modules', 'foldkit-plus')
    write(join(plus, 'package.json'), JSON.stringify({ name: 'foldkit-plus', version: '1.0.0' }))
    write(join(plus, 'skill', 'SKILL.md'), skillText(shippedVersion))
    write(join(plus, 'skill', 'references', 'remote.md'), '# Remote\n')
    return app
  }
  const at = (app: string, home: string) => join(app, home, 'skills', 'foldkit-plus')
  const reference = (app: string, home: string) => join(at(app, home), 'references', 'remote.md')

  it('writes the shipped skill under .claude and .agents of a project that has neither', () => {
    const app = project('fresh', '1.2.0')
    const printed = installSkill(app, false)
    expect(printed.isError).toBe(false)
    expect(printed.text).toBe(
      'Wrote .claude/skills/foldkit-plus: foldkit-plus skill 1.2.0 from foldkit-plus@1.0.0 (2 files).\n' +
        'Wrote .agents/skills/foldkit-plus: foldkit-plus skill 1.2.0 from foldkit-plus@1.0.0 (2 files).\n',
    )
    for (const home of ['.claude', '.agents'])
      expect(readFileSync(reference(app, home), 'utf8')).toBe('# Remote\n')
  })

  it('leaves the same version alone, even where its files were edited', () => {
    const app = project('same', '1.2.0')
    installSkill(app, false)
    write(reference(app, '.claude'), '# Mine\n')
    expect(installSkill(app, false)).toEqual({
      text:
        '.agents/skills/foldkit-plus is already foldkit-plus skill 1.2.0.\n' +
        '.claude/skills/foldkit-plus is already foldkit-plus skill 1.2.0.\n',
      isError: false,
    })
    expect(readFileSync(reference(app, '.claude'), 'utf8')).toBe('# Mine\n')
  })

  it('refuses a different version without force, and replaces it, files and all, with it', () => {
    const app = project('older', '1.2.0')
    write(join(at(app, '.agents'), 'SKILL.md'), skillText('0.9.0'))
    write(join(at(app, '.agents'), 'references', 'gone.md'), '# Gone\n')
    const refused = installSkill(app, false)
    expect(refused.isError).toBe(true)
    expect(refused.text).toBe(
      '.agents/skills/foldkit-plus holds foldkit-plus skill 0.9.0, not the 1.2.0 that ships with the installed code. Run `npx foldkit-plus skill --force` to replace it.\n',
    )
    expect(readFileSync(join(at(app, '.agents'), 'SKILL.md'), 'utf8')).toContain('0.9.0')
    const forced = installSkill(app, true)
    expect(forced.isError).toBe(false)
    expect(forced.text).toContain('Replaced .agents/skills/foldkit-plus')
    expect(existsSync(join(at(app, '.agents'), 'references', 'gone.md'))).toBe(false)
    expect(readFileSync(join(at(app, '.agents'), 'SKILL.md'), 'utf8')).toContain('1.2.0')
    // Only where a skill already was.
    expect(existsSync(at(app, '.claude'))).toBe(false)
  })

  it('refuses an unrelated skill in the folder, with or without a SKILL.md, until forced', () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ['named', 'SKILL.md', skillText('1.2.0', 'other')],
      ['plain', 'notes.txt', 'mine'],
    ]
    for (const [name, file, text] of cases) {
      const app = project(`unrelated-${name}`, '1.2.0')
      write(join(at(app, '.cursor'), file), text)
      const refused = installSkill(app, false)
      expect(refused.isError).toBe(true)
      expect(refused.text).toContain(
        '.cursor/skills/foldkit-plus holds a skill that is not foldkit-plus',
      )
      expect(existsSync(reference(app, '.cursor'))).toBe(false)
      expect(installSkill(app, true).isError).toBe(false)
      expect(existsSync(reference(app, '.cursor'))).toBe(true)
    }
  })

  it('refuses a folder with no project, and a project whose foldkit-plus ships no skill', () => {
    const bare = join(root, 'install', 'bare')
    mkdirSync(bare, { recursive: true })
    expect(() => installSkill(bare, false)).toThrow(/There is no package.json in/)
    const old = project('old', '1.2.0')
    rmSync(join(old, 'node_modules', 'foldkit-plus', 'skill'), { recursive: true })
    expect(() => installSkill(old, false)).toThrow(Refusal)
  })
})

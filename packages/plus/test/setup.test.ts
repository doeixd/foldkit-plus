/**
 * The setup guide for the project it is run in: what it finds, the command it
 * gives for the project's package manager, and what it leaves out.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { SCAFFOLDER, addCommand, setupGuide, type Project } from '../src/setup.js'

const versions = { plus: '0.1.0', effect: '4.0.0', foldkit: '0.165.0' }
const guide = (project: Option.Option<Project>, manager: 'pnpm' | 'npm' = 'pnpm') =>
  setupGuide({ project, manager, versions })
const project = (deps: Readonly<Record<string, string>>, gitattributes = true) =>
  Option.some({ name: 'todo', versions: deps, gitattributes })

describe('setupGuide', () => {
  it('sends an agent with no project to the greenfield guide, and scaffolds with its manager', () => {
    const text = guide(Option.none(), 'npm')
    expect(text).toContain('There is no `package.json` here')
    // Once, in the check that stops it: not again among the steps it is told to skip.
    expect(text.split('skills/foldkit-plus/references/greenfield.md')).toHaveLength(2)
    // `--example` only where the scaffold takes one: an ssr or ssg one refuses it.
    expect(text).toContain(
      `npx ${SCAFFOLDER} --name <name> --rendering spa --example counter --package-manager npm`,
    )
    expect(text).toContain(
      `npx ${SCAFFOLDER} --name <name> --rendering <ssg|ssr> --package-manager npm\n`,
    )
  })

  it('names the greenfield guide in a project too', () => {
    expect(guide(project({ effect: '4.0.0', foldkit: '0.165.0' }))).toContain(
      'Building a new application rather than extending one? Follow its `references/greenfield.md`',
    )
  })

  it('says each library fits when it does', () => {
    const text = guide(project({ effect: '^4.0.0', foldkit: '0.165.0' }))
    expect(text).toContain('- `effect` ^4.0.0: fits.')
    expect(text).toContain('- `foldkit` 0.165.0: fits.')
  })

  it('names a library at the wrong version, a Foldkit minor apart included', () => {
    const text = guide(project({ effect: '^3.17.0', foldkit: '^0.163.0' }))
    expect(text).toContain('`effect` is ^3.17.0, and Foldkit Plus needs 4.0.0')
    expect(text).toContain('`foldkit` is ^0.163.0, and Foldkit Plus needs 0.165.0')
  })

  it('names a library that is missing', () => {
    expect(guide(project({ effect: '4.0.0' }))).toContain('`foldkit` is not installed')
  })

  it('has a project without a `.gitattributes` write one that keeps LF', () => {
    const text = guide(project({}, false))
    expect(text).toContain('There is no `.gitattributes`. Write one')
    expect(text).toContain('```gitattributes\n* text=auto eol=lf\n*.wasm binary\n```')
  })

  it('leaves a `.gitattributes` the project has as it is', () => {
    const text = guide(project({}, true))
    expect(text).toContain('`.gitattributes` is there: leave it as it is.')
    expect(text).not.toContain('eol=lf')
  })

  it("installs with the project's package manager, adapters one by one", () => {
    expect(guide(Option.none(), 'pnpm')).toContain(
      'pnpm add effect@4.0.0 foldkit@0.165.0 @effect/platform-browser@4.0.0 foldkit-plus',
    )
    expect(guide(Option.none(), 'npm')).toContain('npm install foldkit-react react react-dom')
  })

  it('points at the agent skill', () => {
    expect(guide(Option.none())).toContain(
      'npx skills add doeixd/foldkit-plus --skill foldkit-plus',
    )
  })

  it("gives a project the skill's AGENTS.md block, and an empty folder the greenfield guide's", () => {
    expect(guide(project({}))).toContain('references/agents-md.md')
    // The greenfield guide pastes it as a later step.
    expect(guide(Option.none())).not.toContain('references/agents-md.md')
  })
})

describe('addCommand', () => {
  it.each([
    ['npm', 'npm install a b'],
    ['pnpm', 'pnpm add a b'],
    ['yarn', 'yarn add a b'],
    ['bun', 'bun add a b'],
  ] as const)('%s', (manager, command) => {
    expect(addCommand(manager, ['a', 'b'])).toBe(command)
  })
})

describe('an adapter that needs a later Effect than Foldkit allows', () => {
  const authLine = (manager: 'pnpm' | 'npm') =>
    guide(project({ effect: '4.0.0', foldkit: '0.165.0' }), manager)
      .split('\n')
      .find(line => line.includes('foldkit-auth @yielded/auth'))
  it.each([
    ['npm', 'add `legacy-peer-deps=true` to `.npmrc`, then install `effect@^4.0.4`'],
    ['pnpm', '"peerDependencyRules": { "allowedVersions": { "foldkit>effect": "4.0.4" } }'],
  ] as const)('tells %s how to let it in', (manager, fix) => {
    expect(authLine(manager)).toContain('It needs Effect 4.0.4 or later')
    expect(authLine(manager)).toContain(fix)
    expect(authLine(manager)).toContain('Foldkit pins `effect` 4.0.0 exactly')
  })
  it('says nothing of Effect beside an adapter that needs no later one', () => {
    const shiki = guide(project({}), 'npm')
      .split('\n')
      .find(line => line.includes('foldkit-richtext-code-shiki shiki'))
    expect(shiki).not.toContain('Effect')
  })
})

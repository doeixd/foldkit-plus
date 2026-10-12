/**
 * The setup guide for the project it is run in: what it finds, the command it
 * gives for the project's package manager, and what it leaves out.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { addCommand, setupGuide, type Project } from '../src/setup.js'

const versions = { plus: '0.1.0', effect: '4.0.0', foldkit: '0.165.0' }
const guide = (project: Option.Option<Project>, manager: 'pnpm' | 'npm' = 'pnpm') =>
  setupGuide({ project, manager, versions })
const project = (deps: Readonly<Record<string, string>>) =>
  Option.some({ name: 'todo', versions: deps })

describe('setupGuide', () => {
  it('sends an agent with no project to make one first', () => {
    expect(guide(Option.none())).toContain('There is no `package.json` here.')
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

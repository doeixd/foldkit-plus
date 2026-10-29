/**
 * The setup guide for the project it is run in: what it finds, the command it
 * gives for the project's package manager, and what it leaves out.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { SCAFFOLDER, addCommand, setupGuide, type Manager, type Project } from '../src/setup.js'

const versions = { plus: '0.1.0', effect: '4.0.5', foldkit: '0.165.0' }
const guide = (project: Option.Option<Project>, manager: Manager = 'pnpm') =>
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

  it('names the docs command beside the skill', () => {
    expect(guide(project({ effect: '4.0.0', foldkit: '0.165.0' }))).toContain(
      'run `npx foldkit-plus docs <symbol or words>`',
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
    expect(text).toContain('`effect` is ^3.17.0, and Foldkit Plus needs 4.0.5')
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
      'pnpm add --save-exact effect@4.0.5 foldkit@0.165.0 @effect/platform-browser@4.0.5 foldkit-plus',
    )
    expect(guide(Option.none(), 'npm')).toContain(
      'npm install foldkit-react "react@^19.0.0" "react-dom@^19.0.0"',
    )
    // A bare name would install the `latest` tag, an older Yielded beta.
    expect(guide(Option.none(), 'pnpm')).toContain(
      'pnpm add foldkit-auth @yielded/auth@0.1.0-beta.43',
    )
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
    ['npm', 'npm install a b', 'npm install --save-exact a b'],
    ['pnpm', 'pnpm add a b', 'pnpm add --save-exact a b'],
    ['yarn', 'yarn add a b', 'yarn add --exact a b'],
    ['bun', 'bun add a b', 'bun add --exact a b'],
  ] as const)('%s', (manager, command, exact) => {
    expect(addCommand(manager, ['a', 'b'])).toBe(command)
    expect(addCommand(manager, ['a', 'b'], true)).toBe(exact)
  })

  it('quotes a range a shell would read', () => {
    expect(addCommand('npm', ['a@1.0.0-rc.5', 'b@^2.0.0', 'c@>=5 <7'])).toBe(
      'npm install a@1.0.0-rc.5 "b@^2.0.0" "c@>=5 <7"',
    )
  })
})

/** The fields step 2 has the project merge into its `package.json`. */
const pins = (text: string) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)?.[1] ?? 'null')

describe('one Effect for every Effect package', () => {
  const effect = {
    effect: '4.0.5',
    '@effect/platform-browser': '4.0.5',
    '@effect/platform-node': '4.0.5',
    '@effect/platform-node-shared': '4.0.5',
    '@effect/sql-sqlite-node': '4.0.5',
  }

  it('has npm override what the project installs as `$name`, the rest at the release', () => {
    // An ssr scaffold names `@effect/platform-node` itself.
    const ssr = project({ effect: '4.0.0', '@effect/platform-node': '4.0.0' })
    const text = guide(ssr, 'npm')
    expect(pins(text)).toEqual({
      overrides: {
        ...effect,
        effect: '$effect',
        '@effect/platform-browser': '$@effect/platform-browser',
        '@effect/platform-node': '$@effect/platform-node',
      },
    })
    // Each `$name` names a version the install line moves to the release.
    expect(text).toContain(
      'npm install --save-exact effect@4.0.5 foldkit@0.165.0 @effect/platform-browser@4.0.5 @effect/platform-node@4.0.5 foldkit-plus',
    )
  })

  it.each([
    [
      'pnpm',
      {
        pnpm: {
          overrides: effect,
          peerDependencyRules: {
            allowedVersions: { effect: '4.0.5', '@effect/platform-browser': '4.0.5' },
          },
        },
      },
    ],
    ['yarn', { resolutions: effect }],
    ['bun', { overrides: effect }],
  ] as const)('gives %s the release itself', (manager, fields) => {
    const text = guide(project({ '@effect/platform-node': '4.0.0' }), manager)
    expect(pins(text)).toEqual(fields)
  })
})

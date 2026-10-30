/**
 * What `npx foldkit-plus setup` prints: instructions a coding agent can follow
 * in order, for the project it is run in. Pure: the CLI reads the project and
 * this package's manifest and passes them in, so a test can give any project.
 */
import { Option } from 'effect'

export type Manager = 'pnpm' | 'npm' | 'yarn' | 'bun'

/** What the project's `package.json` says about the libraries Foldkit Plus needs. */
export interface Project {
  readonly name: string
  /** Each named library's version range, from any dependency field. */
  readonly versions: Readonly<Record<string, string>>
  /** Whether a `.gitattributes` applies here: in the project's folder or one above it in its repository. */
  readonly gitattributes: boolean
  /** Where pnpm reads this project's settings, which a workspace keeps at its root. */
  readonly pnpmSettings: PnpmSettings
  /** The versions of Effect's packages (`effectPackages`) its npm lockfile holds, nested copies included. */
  readonly locked: ReadonlyArray<string>
}

/** A file pnpm reads settings from, in `folder` relative to the project (`.`, `../..`). */
export interface PnpmSettings {
  readonly folder: string
  readonly file: 'package.json' | 'pnpm-workspace.yaml'
}

/**
 * The versions this release is built and tested against, from its own
 * manifest: the workspace's Foldkit and Effect.
 */
export interface Versions {
  readonly plus: string
  readonly effect: string
  readonly foldkit: string
}

export interface SetupInput {
  readonly project: Option.Option<Project>
  readonly manager: Manager
  readonly versions: Versions
}

const SITE = 'https://foldkit-plus.pages.dev'
const REPOSITORY = 'https://github.com/doeixd/foldkit-plus'

/**
 * The `create-foldkit-app` release whose templates pin the Foldkit this
 * release needs (0.41.0 installs `foldkit`, `@foldkit/ui` and `@foldkit/devtools`
 * 0.170.0, `@foldkit/vite-plugin` 0.29.0 and `effect` 4.1.0). A release that
 * moves the `foldkit` peer moves this with it.
 */
export const SCAFFOLDER = 'create-foldkit-app@0.41.0'

const GREENFIELD = `${REPOSITORY}/blob/main/skills/foldkit-plus/references/greenfield.md`
const AGENTS_BLOCK = `${REPOSITORY}/blob/main/skills/foldkit-plus/references/agents-md.md`

/** What each job needs, where to import it from, and where it is explained. */
export const jobs: ReadonlyArray<{
  readonly job: string
  readonly imports: ReadonlyArray<string>
  readonly guide: string
}> = [
  {
    job: 'Name what a feature may read and which Messages it may send',
    imports: ['surface', 'metadata'],
    guide: 'surface',
  },
  {
    job: 'A reusable Submodel placed several times, every part wired',
    imports: ['bundle', 'bundle-surface'],
    guide: 'bundle',
  },
  {
    job: 'Restyle or extend views from outside, through typed slots',
    imports: ['mixins', 'mixins-surface', 'mixins-ui'],
    guide: 'mixins',
  },
  {
    job: 'Media queries, timers, sockets, clipboard, undo history',
    imports: ['primitives'],
    guide: 'primitives',
  },
  {
    job: 'Declare the domain once: entities, relations, queries',
    imports: ['entity'],
    guide: 'entity',
  },
  {
    job: 'Server-owned data in the Model: queries, mutations, live updates',
    imports: ['remote', 'remote-server', 'remote-drizzle'],
    guide: 'remote',
  },
  {
    job: 'Edits that survive offline and converge across devices',
    imports: ['sync', 'durable'],
    guide: 'sync',
  },
  { job: 'Who may do what, enforced on every seam', imports: ['guard'], guide: 'guard' },
  {
    job: 'Who is signed in: a Yielded Auth session as the principal',
    imports: ['auth'],
    guide: 'auth',
  },
  {
    job: 'A slice of the Model kept in the URL or in storage',
    imports: ['mirror'],
    guide: 'mirror',
  },
  {
    job: 'Forms: drafts, validation, a decoded value, and dates, times and addresses in them',
    imports: ['form', 'mixins-form', 'form-recipes'],
    guide: 'form',
  },
  {
    job: 'Edit, create and list screens over Remote',
    imports: ['crud', 'mixins-crud'],
    guide: 'crud',
  },
  {
    job: 'An interactive data grid over rows you own',
    imports: ['data-grid', 'mixins-data-grid'],
    guide: 'data-grid',
  },
  {
    job: 'Drafts, revisions and publishing for content',
    imports: ['cms', 'cms-drizzle'],
    guide: 'cms',
  },
  {
    job: 'Pages as data, and a builder that edits them',
    imports: ['composition', 'builder', 'mixins-builder'],
    guide: 'composition',
  },
  {
    job: 'Rich text: the document, its editor, Markdown and code',
    imports: [
      'richtext',
      'richtext-dom',
      'mixins-richtext',
      'richtext-markdown',
      'richtext-code',
      'richtext-code-shiki',
    ],
    guide: 'richtext',
  },
  { job: 'Server rendering that hands the Model over', imports: ['ssr'], guide: 'ssr' },
  {
    job: 'Responsive images, their variants and placeholders, and icons as data',
    imports: ['media'],
    guide: 'media',
  },
  { job: 'Route topology as data: nodes, typed targets, titles', imports: ['site'], guide: 'site' },
  {
    job: 'What an AI agent may see and do, over MCP, WebMCP, A2A or Agent Native',
    imports: ['agent', 'agent-mcp', 'agent-webmcp', 'agent-a2a', 'agent-native'],
    guide: 'agent',
  },
  {
    job: 'React components in a Foldkit view, or Foldkit inside React',
    imports: ['react', 'react-codegen'],
    guide: 'react',
  },
]

/**
 * The packages `foldkit-plus` does not install, since each needs a library of
 * its own, and that library at the range the adapter peers on: a manager
 * given a bare name installs the `latest` tag, which for `@yielded/auth` is a
 * beta older than the one `foldkit-auth` names. `test/generated.test.ts`
 * holds this to the manifests.
 */
export const adapters: ReadonlyArray<{
  readonly name: string
  readonly libraries: ReadonlyArray<string>
  readonly when: string
}> = [
  {
    name: 'foldkit-agent-native',
    libraries: ['@agent-native/core@0.214.0'],
    when: 'agents through Agent Native',
  },
  {
    name: 'foldkit-auth',
    libraries: ['@yielded/auth@0.1.0-beta.47'],
    when: 'sign-in and sessions with Yielded Auth',
  },
  {
    name: 'foldkit-cms-drizzle',
    libraries: ['drizzle-orm@1.0.0-rc.5'],
    when: "the CMS's server on Drizzle",
  },
  {
    name: 'foldkit-mixins-ui',
    libraries: ['@foldkit/ui@^0.170.0'],
    when: 'styling `@foldkit/ui` components through slots',
  },
  {
    name: 'foldkit-react',
    libraries: ['react@^19.0.0', 'react-dom@^19.0.0'],
    when: 'React interop',
  },
  {
    name: 'foldkit-react-codegen',
    libraries: ['typescript@>=5.7.2 <7'],
    when: 'compiling Foldkit views to React TSX (a dev dependency)',
  },
  {
    name: 'foldkit-remote-drizzle',
    libraries: ['drizzle-orm@1.0.0-rc.5'],
    when: 'answering Remote reads with Drizzle',
  },
  {
    name: 'foldkit-richtext-code-shiki',
    libraries: ['shiki@^4.4.3'],
    when: 'highlighting code blocks with Shiki',
  },
]

/**
 * The Effect packages an application meets that something names at a version
 * of its own: Foldkit's peers and its Vite plugin's dependencies name one
 * minor (`~4.1.0`), and each `@effect/*` package peers on an `effect` at least
 * its own version. Setup holds all of them at the Effect this release is
 * tested on, as `pnpm-workspace.yaml` does here (`test/generated.test.ts`
 * keeps the two lists together).
 */
export const effectPackages: ReadonlyArray<string> = [
  'effect',
  '@effect/platform-browser',
  '@effect/platform-node',
  '@effect/platform-node-shared',
  '@effect/sql-sqlite-node',
]

const releaseOf = (version: string) =>
  /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number) ?? []

/**
 * The Effect release setup pins: the one this release is tested on, or a later
 * patch of the same minor that the project's lockfile already holds. npm keeps
 * a locked package that an override contradicts rather than move it down, so
 * pinning 4.1.0 left the 4.1.1 that `@foldkit/vite-plugin`'s `~4.1.0` had
 * locked under it, which `npm ls` calls invalid.
 */
export const effectRelease = (tested: string, locked: ReadonlyArray<string>): string => {
  const [major, minor] = releaseOf(tested)
  return locked.reduce((newest, version) => {
    const [lockedMajor, lockedMinor, patch = -1] = releaseOf(version)
    return lockedMajor === major && lockedMinor === minor && patch > (releaseOf(newest)[2] ?? -1)
      ? version
      : newest
  }, tested)
}

/** Where the pins go, and the block that holds them. */
interface Pins {
  /** The file, as the step names it: `package.json`, `../../pnpm-workspace.yaml`. */
  readonly file: string
  readonly language: 'json' | 'yaml'
  readonly text: string
}

/** A YAML key, quoted where `@` would start something else. */
const yamlKey = (key: string) => (key.startsWith('@') ? `'${key}'` : key)

/**
 * The settings that hold every Effect package at `effect`, to merge into the
 * file the manager reads them from. npm applies an override to a package the
 * project depends on only where the project names that same version, so its
 * block sets those dependencies too (a `$name` reference would follow them,
 * but npm 10 cannot resolve a scoped one); pnpm reads them only at a
 * workspace's root.
 */
const pinsOf = (
  manager: Manager,
  effect: string,
  direct: ReadonlySet<string>,
  pnpmSettings: PnpmSettings,
): Pins => {
  const pins = Object.fromEntries(effectPackages.map(name => [name, effect]))
  const allowedVersions = { effect, '@effect/platform-browser': effect }
  if (manager === 'pnpm' && pnpmSettings.file === 'pnpm-workspace.yaml') {
    const lines = (entries: Readonly<Record<string, string>>, indent: string) =>
      Object.entries(entries).map(([name, version]) => `${indent}${yamlKey(name)}: ${version}`)
    return {
      file: `${pnpmSettings.folder}/pnpm-workspace.yaml`,
      language: 'yaml',
      text: [
        'overrides:',
        ...lines(pins, '  '),
        'peerDependencyRules:',
        '  allowedVersions:',
        ...lines(allowedVersions, '    '),
      ].join('\n'),
    }
  }
  const fields = {
    npm: {
      dependencies: Object.fromEntries(
        effectPackages.filter(name => direct.has(name)).map(name => [name, effect]),
      ),
      overrides: pins,
    },
    pnpm: { pnpm: { overrides: pins, peerDependencyRules: { allowedVersions } } },
    yarn: { resolutions: pins },
    bun: { overrides: pins },
  }[manager]
  return {
    file:
      manager === 'pnpm' && pnpmSettings.folder !== '.'
        ? `${pnpmSettings.folder}/package.json`
        : 'package.json',
    language: 'json',
    text: JSON.stringify(fields, null, 2),
  }
}

/** Why `manager` needs the pins, after "first merge this into `package.json`". */
const pinsWhy: Readonly<Record<Manager, string>> = {
  npm: 'npm refuses a peer it does not match, and `overrides` lets one in without turning every peer check off; it overrides a dependency of the project only at the version the project names, so the block sets those too',
  pnpm: "`overrides` sets the version, and `peerDependencyRules` lets Foldkit's exact peers accept it",
  yarn: "`resolutions` sets the version; Yarn warns of Foldkit's exact peers, and installs",
  bun: "`overrides` sets the version; Bun warns of Foldkit's exact peers, and installs",
}

/**
 * The command that adds `packages` with `manager`, at exactly the versions
 * named when `exact`. A range a shell would read (`^`, `>`, a space) is quoted.
 */
export const addCommand = (
  manager: Manager,
  packages: ReadonlyArray<string>,
  exact = false,
): string =>
  [
    manager,
    manager === 'npm' ? 'install' : 'add',
    ...(exact ? [manager === 'npm' || manager === 'pnpm' ? '--save-exact' : '--exact'] : []),
    ...packages.map(spec => (/^[\w@/.-]+$/.test(spec) ? spec : `"${spec}"`)),
  ].join(' ')

/** The major version a range asks for: `^4.0.0`, `~4.1`, `4.0.0-beta.1` all ask for 4. */
const majorOf = (range: string): Option.Option<number> =>
  Option.fromNullishOr(/(\d+)/.exec(range)?.[1]).pipe(Option.map(Number))

/** What the project has of a library against what this release needs, as a line to act on. */
const finding = (project: Project, library: string, wanted: string): string =>
  Option.match(Option.fromNullishOr(project.versions[library]), {
    onNone: () => `- \`${library}\` is not installed: step 2 adds \`${library}@${wanted}\`.`,
    onSome: range => {
      // Foldkit is 0.x, where a minor version breaks; Effect is past 1.
      const matches =
        library === 'foldkit'
          ? range.replace(/^[\^~=v]*/, '').startsWith(wanted.split('.').slice(0, 2).join('.'))
          : Option.getOrUndefined(majorOf(range)) === Option.getOrUndefined(majorOf(wanted))
      return matches
        ? `- \`${library}\` ${range}: fits.`
        : `- \`${library}\` is ${range}, and Foldkit Plus needs ${wanted}: step 2 moves it to ${wanted}. Check the application builds after.`
    },
  })

export const setupGuide = ({ project, manager, versions }: SetupInput): string => {
  // Every Effect package the project names moves with `effect`, so the pins hold.
  const listed = Option.match(project, {
    onNone: () => [],
    onSome: found => effectPackages.filter(name => found.versions[name] !== undefined),
  })
  const moved = new Set(['effect', '@effect/platform-browser', ...listed])
  const effect = effectRelease(
    versions.effect,
    Option.match(project, { onNone: () => [], onSome: found => found.locked }),
  )
  const pins = pinsOf(
    manager,
    effect,
    moved,
    Option.match(project, {
      onNone: () => ({ folder: '.', file: 'package.json' }),
      onSome: found => found.pnpmSettings,
    }),
  )
  // Foldkit's devtools peer on `@foldkit/ui` at any release, and a manager left
  // to pick one takes the newest, which may peer on a newer Effect (#229).
  const uiPeer = Option.exists(
    project,
    found =>
      found.versions['@foldkit/devtools'] !== undefined &&
      found.versions['@foldkit/ui'] === undefined,
  )
  // npm's block already names the Effect packages the project depends on.
  const install = addCommand(
    manager,
    [
      ...(manager === 'npm'
        ? []
        : effectPackages.filter(name => moved.has(name)).map(name => `${name}@${effect}`)),
      `foldkit@${versions.foldkit}`,
      ...(uiPeer ? [`@foldkit/ui@${versions.foldkit}`] : []),
      'foldkit-plus',
    ],
    true,
  )
  const check = Option.match(project, {
    onNone: () => [
      'There is no `package.json` here: this is a new application. Do not scaffold yet. Follow the greenfield guide, which asks the user about the goals, the look and the domain before any code:',
      '',
      `- ${GREENFIELD} (in the skill of step 3, \`references/greenfield.md\`)`,
      '',
      `When its first step has a name and a rendering mode, it scaffolds with the command for that mode; \`--example\` is for spa alone, and an ssg or ssr scaffold refuses it${manager === 'npm' ? ". An ssg scaffold names `@foldkit/devtools` but not `@foldkit/ui`, its peer, so npm takes the newest `@foldkit/ui`, and refuses the install once that one needs a newer Effect than the scaffold's: `--force` lets it install with a warning, and step 2 replaces that `@foldkit/ui` with the one at the scaffold's Foldkit release (`--legacy-peer-deps` would also drop peers the scaffolder itself needs)" : ''}:`,
      '',
      '```bash',
      `npx ${SCAFFOLDER} --name <name> --rendering spa --example counter --package-manager ${manager}`,
      `npx ${manager === 'npm' ? '--force ' : ''}${SCAFFOLDER} --name <name> --rendering ssg --package-manager ${manager}`,
      `npx ${SCAFFOLDER} --name <name> --rendering ssr --package-manager ${manager}`,
      '```',
      '',
      'Then run `npx --legacy-peer-deps foldkit-plus setup` again in the new folder and continue from step 2.',
    ],
    onSome: found => [
      `This is \`${found.name}\`, installed with ${manager}.`,
      '',
      finding(found, 'effect', effect),
      finding(found, 'foldkit', versions.foldkit),
      ...(uiPeer
        ? [
            `- \`@foldkit/devtools\` peers on \`@foldkit/ui\`, which the project does not name: step 2 adds \`@foldkit/ui@${versions.foldkit}\`, since a manager left to choose takes the newest, which may need a newer Effect.`,
          ]
        : []),
      // Never overwritten: line endings are the project's to choose once chosen.
      ...(found.gitattributes
        ? ['- `.gitattributes` is there: leave it as it is.']
        : [
            "- There is no `.gitattributes`. Write one at the repository's root (beside `package.json` if this is not yet a repository), so Git keeps the LF line endings the formatter writes and `git add` on Windows does not warn of every file:",
            '',
            '```gitattributes',
            '* text=auto eol=lf',
            '*.wasm binary',
            '```',
          ]),
    ],
  })
  return [
    `# Foldkit Plus ${versions.plus}: setup`,
    '',
    'Instructions for a coding agent, in order. Each step says what to run and why. Tell the user what you did at the end.',
    '',
    '## What these are',
    '',
    '- **Effect** (https://effect.website): TypeScript for typed effects, errors, schemas and streams. Foldkit Plus targets Effect 4.',
    '- **Foldkit** (https://foldkit.dev): an application is one state machine on Effect, a Schema-typed `Model`, a `Message` union and one pure `update`; I/O runs in Commands and Subscriptions.',
    '- **Foldkit Plus**: packages that extend a Foldkit application to agents, servers, other devices, the URL and design systems without a second place to keep state. An agent sends only Messages `update` already handles; server data lives in the Model; replicas replay the same Messages; the URL mirrors a slice of the Model.',
    '',
    '## 1. Check the project',
    '',
    ...check,
    '',
    '## 2. Install',
    '',
    `Foldkit and its tooling take one Effect minor, and Foldkit Plus is tested on ${versions.effect}.${effect === versions.effect ? '' : ` The lockfile already holds ${effect}, a later patch of that minor, and npm keeps a locked package rather than move it down to an override, so the pins name ${effect}.`} To install one copy of each Effect package, at that release, first merge this into \`${pins.file}\`, keeping what it holds (${pinsWhy[manager]}${pins.file === 'package.json' ? '' : '; pnpm reads them only at the workspace root'}):`,
    '',
    `\`\`\`${pins.language}`,
    pins.text,
    '```',
    '',
    'Then install:',
    '',
    '```bash',
    install,
    '```',
    '',
    '`foldkit-plus` brings every package except the adapters below, each of which needs a library of its own. Add one only when the application needs it:',
    '',
    ...adapters.map(
      each => `- ${each.when}: \`${addCommand(manager, [each.name, ...each.libraries])}\``,
    ),
    '',
    '## 3. Add the agent skill',
    '',
    '```bash',
    'npx skills add doeixd/foldkit-plus --skill foldkit-plus',
    '```',
    '',
    'It teaches you which package owns which kind of state, when to reach for each, and a working example of each. Read its `SKILL.md` before writing code with Foldkit Plus, and the reference for the package at hand before changing it. To look one symbol or topic up in the docs of the versions installed here, run `npx foldkit-plus docs <symbol or words>` (`--list` for what there is).',
    // An empty folder was sent to the guide in step 1.
    ...Option.match(project, {
      onNone: () => [],
      onSome: () => [
        '',
        `Paste the block in its \`references/agents-md.md\` (${AGENTS_BLOCK}) under Project Notes in the project's \`AGENTS.md\`: the house rules and known traps for an application on these packages.`,
        '',
        `Building a new application rather than extending one? Follow its \`references/greenfield.md\` (${GREENFIELD}): goals and the look, then the domain with the user, recorded in the project and mapped to these packages, then a plan for architecture, performance, SEO, testing, CI and deployment, before implementing.`,
      ],
    }),
    '',
    '## 4. Import',
    '',
    'The namespaces most applications use come from the root:',
    '',
    '```ts',
    "import { Surface, Projection, Remote, Sync, Mirror, Agent, Style } from 'foldkit-plus'",
    '```',
    '',
    'Everything else is a subpath named for its package, for example `foldkit-plus/remote-server` on the server, `foldkit-plus/sync/journal`, `foldkit-plus/mixins/theme`. Pick a package by who owns the data:',
    '',
    '| Job | Import from | Guide |',
    '| --- | --- | --- |',
    ...jobs.map(
      each =>
        `| ${each.job} | ${each.imports.map(name => `\`foldkit-plus/${name}\``).join(', ')} | ${SITE}/${each.guide} |`,
    ),
    '',
    '## 5. Rules every package keeps',
    '',
    '- One owner per datum: never keep a fact in the Model and again in a cache, a URL store or a second reducer.',
    '- Behaviour goes through Messages and `update`; agents, replicas and Behaviors never change the Model directly.',
    '- Rendering performs no I/O: fetching, syncing and mirroring run in Commands and Subscriptions.',
    '- Absence is an Effect `Option`, not `null`, except at a JSON, database or DOM boundary.',
    '',
    '## More',
    '',
    `- Guides and API: ${SITE}`,
    `- Demos: ${SITE}/demos`,
    `- Source and changelog: ${REPOSITORY}`,
    '',
  ].join('\n')
}

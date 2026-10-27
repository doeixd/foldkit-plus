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
}

/** The versions this release is built and tested against, from its own manifest. */
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
 * release needs (0.40.0 installs `foldkit`, `@foldkit/ui` and `@foldkit/devtools`
 * 0.169.0, `@foldkit/vite-plugin` 0.28.0 and `effect` 4.0.0). A release that
 * moves the `foldkit` peer moves this with it.
 */
export const SCAFFOLDER = 'create-foldkit-app@0.40.0'

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
 * its own, and that library. `test/setup.test.ts` holds this to the manifest.
 */
export const adapters: ReadonlyArray<{
  readonly name: string
  readonly libraries: ReadonlyArray<string>
  readonly when: string
  /** The least Effect its library needs, where that is past Foldkit's exact `effect` peer. */
  readonly effect?: string
}> = [
  {
    name: 'foldkit-agent-native',
    libraries: ['@agent-native/core'],
    when: 'agents through Agent Native',
  },
  {
    name: 'foldkit-auth',
    libraries: ['@yielded/auth'],
    when: 'sign-in and sessions with Yielded Auth',
    effect: '4.0.4',
  },
  { name: 'foldkit-cms-drizzle', libraries: ['drizzle-orm'], when: "the CMS's server on Drizzle" },
  {
    name: 'foldkit-mixins-ui',
    libraries: ['@foldkit/ui'],
    when: 'styling `@foldkit/ui` components through slots',
  },
  { name: 'foldkit-react', libraries: ['react', 'react-dom'], when: 'React interop' },
  {
    name: 'foldkit-react-codegen',
    libraries: ['typescript'],
    when: 'compiling Foldkit views to React TSX (a dev dependency)',
  },
  {
    name: 'foldkit-remote-drizzle',
    libraries: ['drizzle-orm'],
    when: 'answering Remote reads with Drizzle',
  },
  {
    name: 'foldkit-richtext-code-shiki',
    libraries: ['shiki'],
    when: 'highlighting code blocks with Shiki',
  },
]

/**
 * How `manager` lets a library need a later Effect than Foldkit's exact
 * `effect` peer allows, which every manager otherwise refuses or warns of.
 */
const laterEffect = (manager: Manager, foldkitEffect: string, needed: string): string =>
  ({
    npm: `npm refuses it: add \`legacy-peer-deps=true\` to \`.npmrc\`, then install \`effect@^${needed}\`, so one Effect is installed`,
    pnpm: `allow it in \`package.json\`: \`"pnpm": { "peerDependencyRules": { "allowedVersions": { "foldkit>effect": "${needed}" } } }\``,
    yarn: `allow Foldkit's \`effect\` peer at ${needed}, or Yarn warns of it`,
    bun: `allow Foldkit's \`effect\` peer at ${needed}, or Bun warns of it`,
  })[manager] + ` (Foldkit pins \`effect\` ${foldkitEffect} exactly)`

/** The command that adds `packages` with `manager`. */
export const addCommand = (manager: Manager, packages: ReadonlyArray<string>): string =>
  `${manager} ${manager === 'npm' ? 'install' : 'add'} ${packages.join(' ')}`

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
  const install = addCommand(manager, [
    `effect@${versions.effect}`,
    `foldkit@${versions.foldkit}`,
    `@effect/platform-browser@${versions.effect}`,
    'foldkit-plus',
  ])
  const check = Option.match(project, {
    onNone: () => [
      'There is no `package.json` here: this is a new application. Do not scaffold yet. Follow the greenfield guide, which asks the user about the goals, the look and the domain before any code:',
      '',
      `- ${GREENFIELD} (in the skill of step 3, \`references/greenfield.md\`)`,
      '',
      'When its first step has a name and a rendering mode, it scaffolds with the command for that mode; `--example` is for spa alone, and an ssg or ssr scaffold refuses it:',
      '',
      '```bash',
      `npx ${SCAFFOLDER} --name <name> --rendering spa --example counter --package-manager ${manager}`,
      `npx ${SCAFFOLDER} --name <name> --rendering <ssg|ssr> --package-manager ${manager}`,
      '```',
      '',
      'Then run `npx foldkit-plus setup` again in the new folder and continue from step 2.',
    ],
    onSome: found => [
      `This is \`${found.name}\`, installed with ${manager}.`,
      '',
      finding(found, 'effect', versions.effect),
      finding(found, 'foldkit', versions.foldkit),
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
    '```bash',
    install,
    '```',
    '',
    '`foldkit-plus` brings every package except the adapters below, each of which needs a library of its own. Add one only when the application needs it:',
    '',
    ...adapters.map(
      each =>
        `- ${each.when}: \`${addCommand(manager, [each.name, ...each.libraries])}\`` +
        (each.effect === undefined
          ? ''
          : `. It needs Effect ${each.effect} or later; ${laterEffect(manager, versions.effect, each.effect)}.`),
    ),
    '',
    '## 3. Add the agent skill',
    '',
    '```bash',
    'npx skills add doeixd/foldkit-plus --skill foldkit-plus',
    '```',
    '',
    'It teaches you which package owns which kind of state, when to reach for each, and a working example of each. Read its `SKILL.md` before writing code with Foldkit Plus, and the reference for the package at hand before changing it.',
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

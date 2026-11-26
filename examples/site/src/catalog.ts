/**
 * The site's map: one entry per subsite, each a family of packages that own
 * one kind of state, and the documents its guides are cut from. The home
 * page's cards and every subsite's sidebar are drawn from this list, and the
 * build turns each `source` into guide pages.
 */
import { packageName } from './demos.js'

/** Where a family's packages sit on the home page. */
export type Shelf = 'Foundations' | 'Data' | 'Screens' | 'Delivery'

export interface Source {
  /** The path segment the source's guides are under: `/remote/guides/server/…`. */
  readonly id: string
  /** The sidebar group's label: a package name, or what a document is about. */
  readonly label: string
  /** The Markdown file, from the repository root. */
  readonly file: string
}

export interface Subsite {
  /** The first path segment: `/remote`. */
  readonly id: string
  readonly title: string
  /** One line on the card: what the family is for. */
  readonly tagline: string
  /** Who owns the state the family handles, as the skill's table says it. */
  readonly owner: string
  readonly shelf: Shelf
  /** The packages whose API the subsite documents, by directory under `packages/`. */
  readonly packages: ReadonlyArray<string>
  /** The documents its guides are cut from, the first of them its overview. */
  readonly sources: ReadonlyArray<Source>
}

const readme = (dir: string): Source => ({
  id: dir,
  label: packageName(dir),
  file: `packages/${dir}/README.md`,
})

const doc = (id: string, label: string, name: string): Source => ({
  id,
  label,
  file: `docs/${name}.md`,
})

/** A guide in a package's own `docs/` folder, served under the file's name. */
const guide = (dir: string, id: string, label: string): Source => ({
  id,
  label,
  file: `packages/${dir}/docs/${id}.md`,
})

/** A family documented by its packages' READMEs, in this order, and the documents after them. */
const family = (
  subsite: Omit<Subsite, 'sources'>,
  documents: ReadonlyArray<Source> = [],
): Subsite => ({ ...subsite, sources: [...subsite.packages.map(readme), ...documents] })

export const subsites: ReadonlyArray<Subsite> = [
  family(
    {
      id: 'surface',
      title: 'Surface',
      tagline: 'What one feature may read, and which Messages it may send.',
      owner: 'the application',
      shelf: 'Foundations',
      packages: ['surface', 'metadata'],
    },
    [
      doc('versus-bundle', 'Surface and Bundle', 'surface-vs-bundles'),
      doc('surface-writes', 'Drawing only what a Message can change', 'surface-writes'),
      doc('declare-update', 'Declare your update', 'guides/declare-update'),
      doc('message-impact', 'See what a Message can affect', 'guides/message-impact'),
    ],
  ),
  family(
    {
      id: 'bundle',
      title: 'Bundle',
      tagline:
        'A Submodel packaged once and placed anywhere, its update, view and subscriptions wired.',
      owner: 'the parent Model',
      shelf: 'Foundations',
      packages: ['bundle', 'bundle-surface'],
    },
    [doc('versus-submodel', 'Bundle and Submodel', 'bundle-vs-submodel')],
  ),
  family(
    {
      id: 'mixins',
      title: 'Mixins',
      tagline: 'Typed slots a view exposes, styled from outside without forking it.',
      owner: 'the view contract',
      shelf: 'Foundations',
      packages: ['mixins', 'mixins-surface', 'mixins-ui'],
    },
    [
      doc('composition', 'Inside-out composition', 'mixins'),
      doc('authoring', 'Authoring components', 'authoring-components'),
    ],
  ),
  family(
    {
      id: 'primitives',
      title: 'Primitives',
      tagline: 'Media queries, timers, sockets, undo history and more, as small Bundles.',
      owner: 'the parent Model',
      shelf: 'Foundations',
      packages: ['primitives'],
    },
    (
      [
        ['media', 'Media'],
        ['net', 'Network'],
        ['time', 'Time'],
        ['state', 'State'],
        ['motion', 'Motion'],
        ['interaction', 'Interaction'],
        ['device', 'Device'],
        ['events', 'Events'],
        ['observers', 'Observers'],
        ['dom', 'DOM'],
      ] as const
    ).map(([id, label]) => ({ id, label, file: `packages/primitives/${id}/README.md` })),
  ),
  family(
    {
      id: 'entity',
      title: 'Entity',
      tagline: 'A domain declared once: fields, relations and derived members.',
      owner: 'the domain declaration',
      shelf: 'Data',
      packages: ['entity'],
    },
    [
      doc('domain', 'One domain declaration', 'entity'),
      doc('expressions', 'Expressions', 'expressions'),
      doc('laws', 'Laws', 'laws'),
      doc('operators', 'Operators', 'operators'),
    ],
  ),
  family(
    {
      id: 'metakit',
      title: 'Metakit',
      tagline: 'A business rule written once as data, read by the browser, SQL, forms and proofs.',
      owner: 'the Schema and its transitions',
      shelf: 'Data',
      packages: ['metakit'],
    },
    [
      guide('metakit', 'why-metakit', 'Why rules should be data'),
      guide('metakit', 'getting-started', 'Write a rule once'),
      guide('metakit', 'domain-types', 'Domain types and row aggregates'),
      guide('metakit', 'resumability-and-queries', 'Prune SSR payloads and gate queries'),
      guide('metakit', 'proving-transitions', 'Verify a state machine'),
      guide('metakit', 'stores-and-order', 'What a proof of one step cannot check'),
    ],
  ),
  family(
    {
      id: 'remote',
      title: 'Remote',
      tagline: 'Server data, normalized in the Model: queries, mutations and live updates.',
      owner: 'the server',
      shelf: 'Data',
      packages: ['remote', 'remote-server', 'remote-drizzle', 'remote-domain'],
    },
    [
      doc('server-state', 'Server-derived state', 'remote'),
      guide('remote', 'aggregates', 'Totals over a loaded list'),
      doc('writes', 'Declared writes', 'declared-writes'),
      doc(
        'event-sourced-domains',
        'An event-sourced domain behind Remote',
        'event-sourced-domains',
      ),
    ],
  ),
  family(
    {
      id: 'sync',
      title: 'Sync',
      tagline: 'Edits that work offline and agree across devices, through a durable log.',
      owner: 'the durable log',
      shelf: 'Data',
      packages: ['sync', 'durable'],
    },
    [
      doc('replication', 'Replicated state', 'replication'),
      doc('journal', 'Editing server data', 'editing-server-data'),
    ],
  ),
  family(
    {
      id: 'guard',
      title: 'Guard',
      tagline:
        'Who may read and change what, declared once and enforced on the server, in sync and for agents.',
      owner: 'the domain declaration',
      shelf: 'Data',
      packages: ['guard'],
    },
    [doc('how-guard-works', 'How Guard works', 'guard')],
  ),
  family(
    {
      id: 'auth',
      title: 'Auth',
      tagline:
        'Who is signed in: a Yielded Auth session as the principal a Remote server answers as.',
      owner: 'Yielded Auth, through its session',
      shelf: 'Data',
      packages: ['auth'],
    },
    [doc('versus-guard', 'Auth and Guard', 'auth-and-guard')],
  ),
  family(
    {
      id: 'mirror',
      title: 'Mirror',
      tagline: 'A slice of the Model kept in the URL or in storage, restored on load.',
      owner: 'the local Model',
      shelf: 'Data',
      packages: ['mirror'],
    },
    [doc('mirrored-state', 'Mirrored state', 'mirror')],
  ),
  family(
    {
      id: 'form',
      title: 'Form',
      tagline: 'Drafts, validation and a decoded value, built from the Entity it writes.',
      owner: 'the parent Model',
      shelf: 'Screens',
      packages: ['form', 'mixins-form'],
    },
    [guide('form', 'metakit', 'Limits and guards from a metakit declaration')],
  ),
  family({
    id: 'crud',
    title: 'CRUD',
    tagline: 'Create, edit and list screens, built from a form and a Remote operation.',
    owner: 'Remote and the form',
    shelf: 'Screens',
    packages: ['crud', 'mixins-crud'],
  }),
  family({
    id: 'data-grid',
    title: 'Data grid',
    tagline: 'Keyboard, selection, editing and virtualization over rows you own.',
    owner: 'the grid; the application owns the rows',
    shelf: 'Screens',
    packages: ['data-grid', 'mixins-data-grid'],
  }),
  family({
    id: 'cms',
    title: 'CMS',
    tagline: 'Drafts, revisions, scheduled publishing, and what visitors may see.',
    owner: "the application's tables",
    shelf: 'Screens',
    packages: ['cms', 'cms-drizzle'],
  }),
  family({
    id: 'composition',
    title: 'Composition',
    tagline: 'Pages as data, made of Blocks, and the builder that edits them.',
    owner: 'the Document, as a stored field',
    shelf: 'Screens',
    packages: ['composition', 'builder', 'mixins-builder'],
  }),
  family({
    id: 'richtext',
    title: 'Rich text',
    tagline: 'A semantic document, the commands that edit it, and its editor.',
    owner: 'the local Model',
    shelf: 'Screens',
    packages: [
      'richtext',
      'richtext-dom',
      'mixins-richtext',
      'richtext-markdown',
      'richtext-code',
      'richtext-code-shiki',
    ],
  }),
  family(
    {
      id: 'ssr',
      title: 'SSR',
      tagline: 'Server rendering that hands the browser the Model instead of running init again.',
      owner: 'the application, in a resume plan',
      shelf: 'Delivery',
      packages: ['ssr', 'host'],
    },
    [
      doc('without-javascript', 'Pages that work without JavaScript', 'progressive-enhancement'),
      doc(
        'resume-before-runtime',
        'Make a page answer before the framework loads',
        'guides/resume-before-runtime',
      ),
      doc('cut-script-by-message', 'Cut script by Message', 'guides/cut-script-by-message'),
    ],
  ),
  family({
    id: 'media',
    title: 'Media',
    tagline: 'Responsive images as URLs to write, and icons as data.',
    owner: "the image's source; variants are a cache",
    shelf: 'Delivery',
    packages: ['media'],
  }),
  family(
    {
      id: 'site',
      title: 'Site',
      tagline: 'Routes as data: addresses, titles, head metadata, links and prefetch.',
      owner: 'the tree, as data',
      shelf: 'Delivery',
      packages: ['site'],
    },
    [
      doc('router', 'Site and the Router', 'site-and-router'),
      doc('building', 'Creating a site', 'site'),
      doc('together', 'With Remote and SSR', 'site-remote-ssr'),
    ],
  ),
  family(
    {
      id: 'agent',
      title: 'Agent',
      tagline: 'What an AI agent may see and do, over MCP, WebMCP, A2A or Agent Native.',
      owner: 'the application',
      shelf: 'Delivery',
      packages: ['agent', 'agent-mcp', 'agent-webmcp', 'agent-a2a', 'agent-native'],
    },
    [
      doc('expose', 'Expose, do not reimplement', 'agents'),
      guide('agent', 'machine-tools', "Tools from a state machine's transitions"),
    ],
  ),
  family({
    id: 'react',
    title: 'React',
    tagline: 'React components in a Foldkit view, and Foldkit programs inside React.',
    owner: 'the Model, or the embedded program',
    shelf: 'Delivery',
    packages: ['react', 'react-codegen'],
  }),
]

/** The guides that belong to no one family: what the project is and how its parts meet. */
export const learn: Subsite = {
  id: 'learn',
  title: 'Learn',
  tagline: 'One state machine, many boundaries: the ideas every package shares.',
  owner: 'the application',
  shelf: 'Foundations',
  packages: [],
  sources: [
    doc('quickstart', 'Quickstart', 'quickstart'),
    doc('state', 'Who changes state', 'state-model'),
    doc('events-folds', 'Events, folds and gates', 'events-folds-and-gates'),
    doc('declarations', 'From declarations to the screen', 'declared-data-to-ui'),
    doc('wiring', 'Wiring', 'wiring'),
    doc('errors', 'Errors and failures', 'errors'),
    doc('maintained-lists', 'Keep a list up to date', 'guides/maintained-lists'),
    doc('custom-operations', 'Define an operation and check its laws', 'guides/custom-operations'),
    doc('store-capabilities', 'Hold a rule to a store', 'guides/store-capabilities'),
    doc(
      'custom-language-and-protocol',
      'Write your own language, store or protocol',
      'guides/custom-language-and-protocol',
    ),
    doc('upgrading-metakit', 'Upgrading across the MetaKit unification', 'upgrading-metakit'),
    doc('upgrading-0-41', 'Upgrading to 0.41', 'upgrading-0.41'),
    doc('glossary', 'Glossary', 'glossary'),
  ],
}

/** Every subsite, `learn` first. */
export const allSubsites: ReadonlyArray<Subsite> = [learn, ...subsites]

export const shelves: ReadonlyArray<{ readonly shelf: Shelf; readonly about: string }> = [
  {
    shelf: 'Foundations',
    about: 'What every other package builds on: boundaries, placement and views.',
  },
  { shelf: 'Data', about: 'Data owned outside the page: by a server, a log or the URL.' },
  { shelf: 'Screens', about: 'Forms, tables, content and editors.' },
  { shelf: 'Delivery', about: 'Server rendering, routing, images, AI agents and React.' },
]

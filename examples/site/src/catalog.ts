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
      tagline: 'What a feature may observe, and which Messages it may cause.',
      owner: 'the application',
      shelf: 'Foundations',
      packages: ['surface', 'metadata'],
    },
    [doc('versus-bundle', 'Surface and Bundle', 'surface-vs-bundles')],
  ),
  family({
    id: 'bundle',
    title: 'Bundle',
    tagline: 'A Submodel packaged once and placed many times, with every part wired.',
    owner: 'the parent Model',
    shelf: 'Foundations',
    packages: ['bundle', 'bundle-surface'],
  }),
  family(
    {
      id: 'mixins',
      title: 'Mixins',
      tagline: 'Typed slots a view exposes, styled and extended from outside.',
      owner: 'the view contract',
      shelf: 'Foundations',
      packages: ['mixins', 'mixins-surface', 'mixins-ui'],
    },
    [doc('composition', 'Inside-out composition', 'mixins')],
  ),
  family({
    id: 'primitives',
    title: 'Primitives',
    tagline: 'Media queries, timers, sockets, undo history and more, as small Bundles.',
    owner: 'the parent Model',
    shelf: 'Foundations',
    packages: ['primitives'],
  }),
  family(
    {
      id: 'entity',
      title: 'Entity',
      tagline: 'A domain declared once: fields, relations and derived members.',
      owner: 'the domain declaration',
      shelf: 'Data',
      packages: ['entity'],
    },
    [doc('domain', 'One domain declaration', 'entity')],
  ),
  family(
    {
      id: 'remote',
      title: 'Remote',
      tagline: 'Server-owned facts, normalized inside the Model: queries, mutations, live updates.',
      owner: 'the server',
      shelf: 'Data',
      packages: ['remote', 'remote-server', 'remote-drizzle'],
    },
    [doc('server-state', 'Server-derived state', 'remote')],
  ),
  family(
    {
      id: 'sync',
      title: 'Sync',
      tagline: 'Edits that survive offline and converge across devices, through a durable log.',
      owner: 'the durable log',
      shelf: 'Data',
      packages: ['sync', 'durable'],
    },
    [
      doc('replication', 'Replicated state', 'replication'),
      doc('journal', 'Editing server data', 'editing-server-data'),
    ],
  ),
  family({
    id: 'guard',
    title: 'Guard',
    tagline: 'Who may do what, declared once and enforced on every seam.',
    owner: 'the domain declaration',
    shelf: 'Data',
    packages: ['guard'],
  }),
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
  family({
    id: 'form',
    title: 'Form',
    tagline: 'Drafts, validation and a decoded value, built from the Entity it writes.',
    owner: 'the parent Model',
    shelf: 'Screens',
    packages: ['form', 'mixins-form'],
  }),
  family({
    id: 'crud',
    title: 'CRUD',
    tagline: 'Edit, create and list screens joined from a form and a Remote operation.',
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
    tagline: 'Drafts beside the row, revisions, a schedule, and what a visitor may see.',
    owner: "the application's tables",
    shelf: 'Screens',
    packages: ['cms', 'cms-drizzle'],
  }),
  family({
    id: 'composition',
    title: 'Composition',
    tagline: 'A page as data, Blocks in Regions, and the builder that edits it.',
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
  family({
    id: 'ssr',
    title: 'SSR',
    tagline: 'Server rendering that hands the Model over instead of running init again.',
    owner: 'the application, in a resume plan',
    shelf: 'Delivery',
    packages: ['ssr'],
  }),
  family(
    {
      id: 'site',
      title: 'Site',
      tagline: 'Route topology as data: nodes, typed targets, titles and sections.',
      owner: 'the tree, as data',
      shelf: 'Delivery',
      packages: ['site'],
    },
    [doc('building', 'Creating a site', 'site')],
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
    [doc('expose', 'Expose, do not reimplement', 'agents')],
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
    { id: 'overview', label: 'Foldkit Plus', file: 'README.md' },
    doc('state', 'Who changes state', 'state-model'),
    doc('wiring', 'Wiring', 'wiring'),
    doc('ui', 'UI architecture', 'ui-architecture'),
    doc('glossary', 'Glossary', 'glossary'),
  ],
}

/** Every subsite, `learn` first. */
export const allSubsites: ReadonlyArray<Subsite> = [learn, ...subsites]

export const shelves: ReadonlyArray<{ readonly shelf: Shelf; readonly about: string }> = [
  {
    shelf: 'Foundations',
    about: 'Boundaries, placement and views: what every other package builds on.',
  },
  { shelf: 'Data', about: 'Facts with an owner outside the page: a server, a log, the URL.' },
  { shelf: 'Screens', about: 'Forms, tables, documents and editors, drawn through slots.' },
  { shelf: 'Delivery', about: 'Getting the application to a server, a router, an agent or React.' },
]

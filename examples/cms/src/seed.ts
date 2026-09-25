/**
 * What `pnpm dev` starts with: four published posts and two published pages,
 * written as a publish would have left them (the row, its CMS entry, and its
 * first revision), so the worklist, the history and the public site all have
 * something to show. The scripted run starts empty and builds its own.
 */
import type { DatabaseSync } from 'node:sqlite'

interface Seeded {
  readonly id: string
  readonly type: 'posts' | 'pages'
  readonly table: 'posts' | 'pages'
  readonly label: string
  /** The row's columns, as the publish handler writes them. */
  readonly row: Readonly<Record<string, string>>
  /** What was published: the form's value. */
  readonly values: Readonly<Record<string, unknown>>
  readonly daysAgo: number
}

const post = (
  id: string,
  title: string,
  slug: string,
  excerpt: string,
  body: ReadonlyArray<string>,
  daysAgo: number,
): Seeded => {
  const values = { title, slug, excerpt, cover: '', body: body.join('\n\n') }
  return { id, type: 'posts', table: 'posts', label: title, row: values, values, daysAgo }
}

const page = (
  id: string,
  title: string,
  slug: string,
  document: unknown,
  daysAgo: number,
): Seeded => {
  const values = { title, slug, document }
  return {
    id,
    type: 'pages',
    table: 'pages',
    label: title,
    row: { title, slug, document: JSON.stringify(document) },
    values,
    daysAgo,
  }
}

const node = (
  block: string,
  props: Readonly<Record<string, unknown>>,
  regions: Readonly<Record<string, ReadonlyArray<string>>> = {},
  appearance?: Readonly<Record<string, string>>,
) => ({ block, props, regions, ...(appearance === undefined ? {} : { appearance }) })

const home = {
  format: 1,
  roots: ['hero', 'latest', 'featured', 'about'],
  nodes: {
    hero: node(
      'Hero',
      {
        eyebrow: 'Notes on building software',
        title: 'Small tools, carefully made',
        lead: 'Essays on design, data and the craft of shipping, written in the open.',
      },
      { actions: ['read', 'aboutLink'] },
      { tone: 'accent' },
    ),
    read: node(
      'Button',
      { label: 'Read the blog', href: '/site/blog' },
      {},
      { tone: 'neutral', variant: 'solid' },
    ),
    aboutLink: node(
      'Button',
      { label: 'About this site', href: '/site/about' },
      {},
      { tone: 'neutral', variant: 'outline' },
    ),
    latest: node('Section', { heading: '' }, { body: ['posts'] }),
    posts: node('PostList', { heading: 'Latest writing', count: '3' }),
    featured: node('Section', { heading: '' }, { body: ['feature'] }, { tone: 'muted' }),
    feature: node('FeaturedPost', { post: 'post-page-as-data' }),
    about: node(
      'Section',
      { heading: 'What this is' },
      { body: ['aboutText', 'note'] },
      { width: 'narrow' },
    ),
    aboutText: node('Text', {
      body: 'This site is an example of Foldkit Plus: the posts are written in a CMS, and this page was built with its page Builder.\n\nEvery page is a document of Blocks. Authors arrange them; the site draws them with its own views.',
    }),
    note: node('Callout', {
      title: 'Try it',
      body: 'Open the page editor, change this page, and publish it. The site shows what was published, and nothing else.',
    }),
  },
}

const about = {
  format: 1,
  roots: ['hero', 'story'],
  nodes: {
    hero: node(
      'Hero',
      { eyebrow: 'About', title: 'Written by the people who build it', lead: '' },
      {},
      { tone: 'plain', align: 'center' },
    ),
    story: node('Section', { heading: '' }, { body: ['columns', 'quote'] }),
    columns: node('Columns', {}, { left: ['text'], right: ['image'] }, { ratio: '2:1' }),
    text: node('Text', {
      body: 'We write about the parts of software that outlast a framework: how state is owned, how data moves, how a screen says what is true.\n\nThe posts are short on purpose. Each one tries to say a single thing well.',
    }),
    image: node('Image', {
      src: '/images/desk.svg',
      alt: 'A desk with a lamp and an open notebook',
      caption: 'Where the drafts happen.',
    }),
    quote: node('Quote', {
      text: 'Make it work, make it right, make it fast.',
      cite: 'Kent Beck',
    }),
  },
}

export const seeded: ReadonlyArray<Seeded> = [
  post(
    'post-owning-state',
    'Who owns this state?',
    'who-owns-this-state',
    'Most bugs in an interface are two places believing different things. Name one owner, and the rest follows.',
    [
      'Every value on a screen came from somewhere. When two places both believe they hold it, the screen will eventually show one of them wrong.',
      'So before writing a component, ask who owns each fact it shows: the server, the URL, the form, or the component itself. Then let everything else read, never write.',
      'It is a small discipline, and it removes a whole family of bugs.',
    ],
    9,
  ),
  post(
    'post-page-as-data',
    'A page is data',
    'a-page-is-data',
    'Store what an author chose, not the HTML it made. The site draws it; an agent can edit it; a migration can move it.',
    [
      'A page builder that stores HTML has already lost: every design change is a find-and-replace across content nobody remembers writing.',
      'Store the choices instead. A hero, a heading, a list of the latest posts: a small tree of named Blocks with their props. The site draws it with its own views, today and after the redesign.',
      'And because it is data, it can be checked, migrated, diffed, and edited by an agent as safely as by a person.',
    ],
    6,
  ),
  post(
    'post-drafts',
    'Saving is not publishing',
    'saving-is-not-publishing',
    'An editor that saves every keystroke, and publishes only when asked, is kinder to authors and easier to reason about.',
    [
      'Autosave used to mean a timer and a prayer. It can be simpler: a draft is its own record, saved after a pause, and publishing copies it into the live row.',
      'Authors stop worrying about losing work, and readers never see a half-finished sentence.',
    ],
    3,
  ),
  post(
    'post-small-queries',
    'Queries that say what they mean',
    'queries-that-say-what-they-mean',
    'Declare a list by what it means, and let the server compile it. The client and the server then agree by construction.',
    [
      'A list of the latest posts is a sentence: posts, published, newest first. Written that way, the same declaration can be compiled to SQL on the server and matched against a cache on the client.',
      'No second copy of the question to keep in step, and no endpoint to forget.',
    ],
    1,
  ),
  page('page-home', 'Home', 'home', home, 8),
  page('page-about', 'About', 'about', about, 8),
]

/** Writes the seed into a database whose tables are made: each item as a publish would leave it. */
export const seed = (sqlite: DatabaseSync, now: Date): void => {
  for (const item of seeded) {
    const at = new Date(now.getTime() - item.daysAgo * 86_400_000).toISOString()
    const columns = { id: item.id, ...item.row, published_at: at }
    const names = Object.keys(columns)
    sqlite
      .prepare(
        `insert into ${item.table} (${names.join(', ')}) values (${names.map(() => '?').join(', ')})`,
      )
      .run(...Object.values(columns))
    const entry = `entry-${item.id}`
    sqlite
      .prepare(
        'insert into cms_entries (id, type, target_id, label, created_by, created_at, archived_at, revision) values (?, ?, ?, ?, ?, ?, null, 1)',
      )
      .run(entry, item.type, item.id, item.label, 'edda', at)
    sqlite
      .prepare(
        'insert into cms_revisions (id, entry_id, n, "values", published_at, published_by) values (?, ?, 1, ?, ?, ?)',
      )
      .run(`${entry}:1`, entry, JSON.stringify(item.values), at, 'edda')
  }
}

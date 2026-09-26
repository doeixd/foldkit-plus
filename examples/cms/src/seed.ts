/**
 * What `pnpm dev` starts with: four published posts and two published pages,
 * imported by the CMS (`cms.import`), which publishes each as an author's publish
 * would: the application's own create handler writes the row, and the entry and
 * its first revision follow. The scripted run starts empty and builds its own.
 */
import { Effect } from 'effect'

/** What `cms.import` takes, less whom it is imported as, which the server fixes. */
interface Imported {
  readonly type: 'posts' | 'pages'
  readonly values: unknown
  readonly at: Date
  readonly entry: string
}

interface Seeded {
  /** The name the rest of the seed knows it by; the row's id is the create handler's. */
  readonly key: string
  readonly values: Readonly<Record<string, unknown>>
  readonly daysAgo: number
}

const post = (
  key: string,
  title: string,
  slug: string,
  excerpt: string,
  body: ReadonlyArray<string>,
  daysAgo: number,
): Seeded => ({
  key,
  values: { title, slug, excerpt, cover: '', body: body.join('\n\n') },
  daysAgo,
})

const node = (
  block: string,
  props: Readonly<Record<string, unknown>>,
  regions: Readonly<Record<string, ReadonlyArray<string>>> = {},
  appearance?: Readonly<Record<string, string>>,
) => ({ block, props, regions, ...(appearance === undefined ? {} : { appearance }) })

/** The home page, with the featured post by the id its import gave it. */
const home = (featured: string) => ({
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
    posts: node('PostList', { heading: 'Latest writing', count: 3 }),
    featured: node('Section', { heading: '' }, { body: ['feature'] }, { tone: 'muted' }),
    feature: node('FeaturedPost', { post: featured }),
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
})

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

const posts: ReadonlyArray<Seeded> = [
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
]

/** Imports the seed, as `imported` imports each item: the posts, then the pages that point at them. */
export const seed = <E, R>(
  imported: (item: Imported) => Effect.Effect<{ readonly targetId: string }, E, R>,
  now: Date,
): Effect.Effect<void, E, R> =>
  Effect.gen(function* () {
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000)
    const ids = new Map<string, string>()
    for (const { key, values, daysAgo } of posts) {
      const { targetId } = yield* imported({
        type: 'posts',
        values,
        at: ago(daysAgo),
        entry: `entry-${key}`,
      })
      ids.set(key, targetId)
    }
    const pages = [
      {
        key: 'page-home',
        values: { title: 'Home', slug: 'home', document: home(ids.get('post-page-as-data') ?? '') },
      },
      { key: 'page-about', values: { title: 'About', slug: 'about', document: about } },
    ]
    for (const { key, values } of pages)
      yield* imported({ type: 'pages', values, at: ago(8), entry: `entry-${key}` })
  })

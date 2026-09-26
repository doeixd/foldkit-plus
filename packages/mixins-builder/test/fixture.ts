/** A small site: Sections of Headings and Banners, and a Builder over it. */
import { Effect, Option, Schema } from 'effect'
import { Builder } from 'foldkit-builder'
import { Input } from 'foldkit-form'
import { Block, Catalog, Content, Region } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Renderer } from 'foldkit-composition/foldkit'
import { BuilderView } from 'foldkit-mixins-builder'

export const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
}).pipe(
  Block.annotate(BuilderView.describe({ group: 'Layout', description: 'A band of the page' })),
)
export const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
}).pipe(Block.annotate(BuilderView.describe({ group: 'Text' })))
/** A Block with a prop of each kind the inspector draws. */
export const Banner = Block.define('Banner', {
  Props: Schema.Struct({
    text: Schema.String,
    size: Schema.Literals(['small', 'large']),
    columns: Schema.Literals([1, 2]),
    count: Schema.Number,
    shown: Schema.Boolean,
  }),
  provides: [Content.Flow],
  appearance: {
    tone: { kind: 'variant', values: ['plain', 'loud'] },
    space: { kind: 'token', values: ['s', 'm'], breakpoints: ['md'] },
  },
  events: ['press'],
}).pipe(
  Block.annotate(
    BuilderView.describe({
      label: 'Promo banner',
      group: 'Text',
      description: 'A line that stands out',
    }),
  ),
)
/** What a Banner's press may run: subscribe to a list, with a note. */
export const Subscribe = {
  name: 'subscribe',
  description: 'Subscribe to a list',
  input: Schema.Struct({ list: Schema.Literals(['news', 'offers']), note: Schema.String }),
  toMessage: (input: { readonly list: string; readonly note: string }) => input,
}
/** A Block whose props ask for their controls: a title, a multiline hint, a hidden prop. Not offered. */
export const Quote = Block.define('Quote', {
  Props: Schema.Struct({
    // A title before a check, which Effect 4 resolves past (F26 in the CMS findings).
    text: Schema.String.annotate({ title: 'Quotation' }).check(Schema.isMinLength(1)),
    source: Schema.String,
    ref: Schema.String,
  }),
  provides: [Content.Flow],
}).pipe(Block.annotate(Builder.controls({ text: Input.multiline(), ref: Input.hidden() })))
/** A Block drawn from its node's read: what a Query Block's rows would be. Not offered. */
export const Feed = Block.define('Feed', {
  Props: Schema.Struct({}),
  provides: [Content.Flow],
})
/** What a Featured Block points at. */
const Category = Entity.define(
  'Category',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String, name: Schema.String }))
/** A Block whose props are ids of the application's things, chosen with pickers. Not offered. */
export const Featured = Block.define('Featured', {
  Props: Schema.Struct({
    // Stored as `null` when none is chosen, drawn as an Option.
    category: Schema.OptionFromNullOr(Schema.String),
    // Required: an empty id is no maker.
    maker: Schema.String.check(Schema.isMinLength(1)),
    tags: Schema.Array(Schema.String),
  }),
  provides: [Content.Flow],
}).pipe(
  Block.annotate(
    Builder.controls({
      category: Input.relationOne(Category),
      maker: Input.relationOne(Category),
      tags: Input.relationMany(Tag),
    }),
  ),
)
export const Site = Catalog.make({
  blocks: [Section, Heading, Banner, Quote, Feed, Featured],
  roots: [Content.Section],
  context: Schema.Struct({ audience: Schema.Literals(['guest', 'member']), beta: Schema.Boolean }),
  actions: [Subscribe],
})

export const SiteRenderer = Renderer.make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Banner: ({ props, appearance, h }) => {
    // A raw choice is one name, or a name per breakpoint on a responsive axis.
    const tone = appearance['tone']
    return h.p(
      [h.Class('banner'), h.DataAttribute('tone', typeof tone === 'string' ? tone : 'plain')],
      [props.text],
    )
  },
  Quote: ({ props, h }) => h.blockquote([], [props.text]),
  Feed: ({ data, h }) =>
    h.p([h.Class('feed')], [typeof data === 'string' ? data : 'waiting for its rows']),
  Featured: ({ props, h }) =>
    h.p(
      [h.Class('featured')],
      [`${Option.getOrElse(props.category, () => 'none')}: ${props.tags.join(', ')}`],
    ),
})

export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: {
    Section: { tone: 'plain' },
    Heading: { text: 'New heading' },
    Banner: { text: 'Hello', size: 'small', columns: 1, count: 1, shown: true },
  },
  preview: { audience: 'guest' },
})

export const PageView = BuilderView.define(PageBuilder)

/** Runs a Command's Effect: the Message it answers with. */
export const answer = <M>(command: { readonly effect: Effect.Effect<M> }): M =>
  Effect.runSync(command.effect)

/** A runtime runs the live region's timers; a test that follows Commands in turn does not. */
export const isTimer = (command: { readonly name: string }): boolean =>
  command.name.startsWith('LiveAnnounce.')

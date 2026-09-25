/** A small site: Sections of Headings and Banners, and a Builder over it. */
import { Effect, Schema } from 'effect'
import { Builder } from 'foldkit-builder'
import { Block, Catalog, Content, Region } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { BuilderView } from 'foldkit-mixins-builder'

export const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
export const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
/** A Block with a prop of each kind the inspector draws. */
export const Banner = Block.define('Banner', {
  Props: Schema.Struct({
    text: Schema.String,
    size: Schema.Literals(['small', 'large']),
    count: Schema.Number,
    shown: Schema.Boolean,
  }),
  provides: [Content.Flow],
})
export const Site = Catalog.make({ blocks: [Section, Heading, Banner], roots: [Content.Section] })

export const SiteRenderer = Renderer.make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Banner: ({ props, h }) => h.p([h.Class('banner')], [props.text]),
})

export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: {
    Section: { tone: 'plain' },
    Heading: { text: 'New heading' },
    Banner: { text: 'Hello', size: 'small', count: 1, shown: true },
  },
})

export const PageView = BuilderView.define(PageBuilder)

/** Runs a Command's Effect: the Message it answers with. */
export const answer = <M>(command: { readonly effect: Effect.Effect<M> }): M =>
  Effect.runSync(command.effect)

/** A runtime runs the live region's timers; a test that follows Commands in turn does not. */
export const isTimer = (command: { readonly name: string }): boolean =>
  command.name.startsWith('LiveAnnounce.')

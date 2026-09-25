/** A small site and a Builder over it: Sections of Headings and Buttons. */
import { Effect, Schema } from 'effect'
import { Block, Catalog, Content, Region } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { Builder } from 'foldkit-builder'

export const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
export const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow, Content.Interactive],
})
export const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
export const Site = Catalog.make({ blocks: [Heading, Button, Section], roots: [Content.Section] })

export const SiteRenderer = Renderer.make(Site, {
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Button: ({ props, h }) => h.span([h.Class('button')], [props.label]),
  Section: ({ regions, h }) => h.section([], [...regions.body]),
})

// Buttons have no starting props, so the insert panel does not offer them.
export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: { Section: {}, Heading: { text: 'New heading' } },
})

/** Runs a Command's Effect: the Message it answers with. */
export const answer = <M>(command: { readonly effect: Effect.Effect<M> }): M =>
  Effect.runSync(command.effect)

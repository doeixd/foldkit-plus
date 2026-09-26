/** A small site and a Builder over it: Sections of Headings and Buttons. */
import { Effect, Schema } from 'effect'
import { Block, Catalog, Content, Region } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { Builder } from 'foldkit-builder'
import { Input } from 'foldkit-form'

export const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
export const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow, Content.Interactive],
})
/**
 * A number and its caption, for the inspector: a number typed as text, a
 * caption drawn as a multiline field, and a frame no control fits. Not offered.
 */
export const Stat = Block.define('Stat', {
  Props: Schema.Struct({
    value: Schema.Number,
    caption: Schema.String.annotate({ title: 'What it counts' }).check(
      Schema.isMaxLength(12, { message: 'Keep it short' }),
    ),
    frame: Schema.Struct({ width: Schema.Number }),
    // Stored as text: its check is on the decoded number, past the transformation.
    rank: Schema.NumberFromString.check(Schema.isGreaterThan(0, { message: 'Above zero' })),
  }),
  provides: [Content.Flow],
}).pipe(Block.annotate(Builder.controls({ caption: Input.multiline() })))
/** Flow that holds Flow: a node can be moved into it from beside it. */
export const Group = Block.define('Group', {
  Props: Schema.Struct({}),
  regions: { items: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Flow],
})
export const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
export const Site = Catalog.make({
  blocks: [Heading, Button, Group, Section, Stat],
  roots: [Content.Section],
})

export const SiteRenderer = Renderer.make(Site, {
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Button: ({ props, h }) => h.span([h.Class('button')], [props.label]),
  Group: ({ regions, h }) => h.div([], [...regions.items]),
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Stat: ({ props, h }) => h.p([], [`${props.value} ${props.caption}`]),
})

// Buttons have no starting props, so the insert panel does not offer them.
export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: { Section: {}, Heading: { text: 'New heading' } },
})

/**
 * Whether a Command is the live region's timer (`LiveAnnounce.read` or
 * `.clear`). A runtime runs those beside everything else; a test that follows
 * each Command in turn leaves them out, as it has no clock to wait on.
 */
export const isTimer = (command: { readonly name: string }): boolean =>
  command.name.startsWith('LiveAnnounce.')

/** Runs a Command's Effect: the Message it answers with. */
export const answer = <M>(command: { readonly effect: Effect.Effect<M> }): M =>
  Effect.runSync(command.effect)

/** A small site and a Builder over it: Sections of Headings and Buttons. */
import { Effect, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
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
    // Its empty field reads back as `null`, not the `''` a node may hold.
    note: Schema.NullOr(Schema.String),
    // An `Option` asks for no control: stored as text or `null`, it is typed as text.
    source: Schema.OptionFromNullOr(Schema.String).annotate({
      description: 'Where the number comes from',
    }),
  }),
  provides: [Content.Flow],
  events: ['press', 'hold'],
}).pipe(Block.annotate(Builder.controls({ caption: Input.multiline() })))
/** A control of the application's own, backed by a Bundle: a color picker. */
const ColorModel = Schema.Struct({ open: Schema.Boolean, hex: Schema.String })
export const ColorMessage = defineMessageUnion({ Opened: {}, Chose: { hex: Schema.String } })
export const ColorPicker = Bundle.make({
  name: 'ColorPicker',
  Model: ColorModel,
  Message: ColorMessage,
  init: () => ({ model: { open: false, hex: '#000000' } }),
  update: (model: typeof ColorModel.Type, message: typeof ColorMessage.Type) =>
    message._tag === 'Opened'
      ? { model: { ...model, open: true } }
      : { model: { open: false, hex: message.hex } },
})
export const ColorInput = Input.bundle('ColorPicker', {
  bundle: ColorPicker,
  value: model => model.hex,
  fill: (model, hex) => ({ ...model, hex }),
  settled: model => ({ ...model, open: false }),
})
/** A tint chosen with the color picker. Not offered. */
export const Swatch = Block.define('Swatch', {
  Props: Schema.Struct({ tint: Schema.String }),
  provides: [Content.Flow],
}).pipe(Block.annotate(Builder.controls({ tint: ColorInput })))

/** What an event may run: subscribe to a list, some times over, with a note. */
export const Subscribe = {
  name: 'subscribe',
  description: 'Subscribe to a list',
  input: Schema.Struct({
    list: Schema.Literals(['news', 'offers']),
    times: Schema.Number,
    note: Schema.String,
  }),
  toMessage: (input: { readonly list: string; readonly times: number; readonly note: string }) =>
    input,
}
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
  blocks: [Heading, Button, Group, Section, Stat, Swatch],
  actions: [Subscribe],
  roots: [Content.Section],
})

export const SiteRenderer = Renderer.make(Site, {
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Button: ({ props, h }) => h.span([h.Class('button')], [props.label]),
  Group: ({ regions, h }) => h.div([], [...regions.items]),
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Swatch: ({ props, h }) => h.span([], [props.tint]),
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

import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'

/**
 * A frame publishes a tray and the panels that sit in it; it owns no state.
 * It is what holds several things that belong together (a few alerts, an
 * accordion's items, a list of rows): a tinted tray with a title and an
 * action above and a note below, and each panel a bordered surface of its
 * own. Draw the parts it has and skip the rest. Reach for a Card when there
 * is one thing to hold.
 */
export const FrameSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Container }),
  panels: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
})

/**
 * A frame in one call: the regions it has, the panels in it, a style for
 * its slots, and mixins beside the style. No upstream component stands
 * behind it.
 */
export interface FrameView<Message = never> {
  readonly title?: string | undefined
  /** The level of the heading that holds the title, for the page's outline. Default 3. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined
  readonly description?: string | undefined
  /** Controls at the end of the header. */
  readonly action?: Html | undefined
  /** What sits in the tray, each in a panel of its own. */
  readonly panels: ReadonlyArray<Html>
  /** A note under the panels, drawn on the tray. */
  readonly footer?: Html | undefined
  /** A style of `FrameSlots`, for the frame's look. */
  readonly style?: NamedStyle<typeof FrameSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const headingOf =
  <Message>(h: HtmlBuilder<Message>) =>
  (level: NonNullable<FrameView<Message>['headingLevel']> = 3) =>
    ({ 2: h.h2, 3: h.h3, 4: h.h4, 5: h.h5, 6: h.h6 })[level]

export const view = <Message = never>(
  options: FrameView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    FrameSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const heading = headingOf(h)
  const hasHeader =
    options.title !== undefined || options.description !== undefined || options.action !== undefined
  return h.div(builders.root.attrs(), [
    ...(hasHeader
      ? [
          h.div(builders.header.attrs(), [
            ...(options.title === undefined
              ? []
              : [heading(options.headingLevel)(builders.title.attrs(), [options.title])]),
            ...(options.description === undefined
              ? []
              : [h.p(builders.description.attrs(), [options.description])]),
            ...(options.action === undefined
              ? []
              : [h.div(builders.action.attrs(), [options.action])]),
          ]),
        ]
      : []),
    h.div(
      builders.panels.attrs(),
      options.panels.map(panel => h.div(builders.panel.attrs(), [panel])),
    ),
    ...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),
  ])
}

/** What a Frame is given once: its look and its heading level. */
export type FramePreset = Pick<FrameView<never>, 'style' | 'headingLevel'> & {
  readonly mixins?: MixinList<never>
}

/** The application's own Frame: `base` for every use, `presets` chosen at a use, and the call over both. */
export const configure = <const Names extends string = never>(
  config: Presets<FramePreset, Names>,
): {
  readonly view: <Outer>(
    options: FrameView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})

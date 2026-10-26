import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An application's page frame: a skip link, a header bar, an optional side
 * column, the main region and a footer. It places what it is given and owns
 * nothing else, with no Model, no Messages and no Mount, so it draws the same
 * on a server.
 *
 * The side column takes a `Sidebar`'s view, which brings its own navigation
 * landmark, its collapse, and, below the theme's `md` breakpoint, its opener
 * and Sheet. At that width the frame puts the column beside the header, where
 * the opener belongs. The header's `actions` and `status` take components
 * (`Segmented`, `Badge`, `Avatar`) rather than text.
 *
 * Its landmarks are one of each: the header is the banner, `main` is the main
 * region, which the skip link focuses, and the footer is the content info. The
 * side column is a plain region, since a `Sidebar` inside it is the navigation.
 */
export const AppShellSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  skip: Slot.make({ capability: Capability.Interactive }),
  header: Slot.make({ capability: Capability.Container }),
  brand: Slot.make({ capability: Capability.Container }),
  mark: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  side: Slot.make({ capability: Capability.Container }),
  main: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
})

export interface AppShellWords {
  /** The skip link's text. Default `Skip to content`. */
  readonly skip?: string | undefined
}

export interface AppShellView<Message = never> {
  /** The application's name, in the header. */
  readonly title: string
  /** A mark before the title: a logo or an icon, hidden from a screen reader. */
  readonly brand?: Html | undefined
  /** Controls at the header's end: a theme switch, a menu, a person. */
  readonly actions?: ReadonlyArray<Html> | undefined
  /** What the application is doing (online, syncing, saved), before the actions. */
  readonly status?: ReadonlyArray<Html> | undefined
  /** The side column: a `Sidebar`'s view. Without it the page is one column. */
  readonly side?: Html | undefined
  readonly footer?: ReadonlyArray<Html> | undefined
  /** The main region's id, which the skip link targets. Default `main`. */
  readonly mainId?: string | undefined
  readonly words?: AppShellWords | undefined
  /** A style of `AppShellSlots`, for the frame's look. */
  readonly style?: NamedStyle<typeof AppShellSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: AppShellView<Message>,
  main: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    AppShellSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const mainId = options.mainId ?? 'main'
  // Whether there is a side column is a fact of the layout, so a style reads it.
  const sided = options.side !== undefined
  return h.div(builders.root.attrs(sided ? [h.DataAttribute('side', '')] : []), [
    h.a(builders.skip.attrs([h.Href(`#${mainId}`)]), [options.words?.skip ?? 'Skip to content']),
    h.header(builders.header.attrs(), [
      h.div(builders.brand.attrs(), [
        ...(options.brand === undefined
          ? []
          : [h.span(builders.mark.attrs([h.AriaHidden(true)]), [options.brand])]),
        h.span(builders.title.attrs(), [options.title]),
      ]),
      ...(options.status === undefined || options.status.length === 0
        ? []
        : [h.div(builders.status.attrs(), options.status)]),
      ...(options.actions === undefined || options.actions.length === 0
        ? []
        : [h.div(builders.actions.attrs(), options.actions)]),
    ]),
    ...(options.side === undefined ? [] : [h.div(builders.side.attrs(), [options.side])]),
    // Focusable by script only, so the skip link moves focus here and Tab goes on from it.
    h.main(builders.main.attrs([h.Id(mainId), h.Tabindex(-1)]), main),
    ...(options.footer === undefined || options.footer.length === 0
      ? []
      : [h.footer(builders.footer.attrs(), options.footer)]),
  ])
}

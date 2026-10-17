/**
 * The markup of a menu, listbox and combobox, drawn from their bundles. The
 * three publish one shape for the floating half (the click-away behind the
 * panel, the panel and its option groups), so one drawing serves both the
 * forks' upstream markup and the adapters' default `draw`, in any Message.
 * Keys and order are upstream's: the forks' parity batteries hold them to it.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotAttributes } from 'foldkit-mixins'

interface Part<Message> {
  readonly key: string
  readonly attributes: SlotAttributes<Message>
}

interface PopupGroup<Message> {
  readonly heading:
    | { readonly id: string; readonly attributes: SlotAttributes<Message>; readonly content: Html }
    | undefined
  readonly group: Part<Message> | undefined
  readonly separator: Part<Message> | undefined
  readonly items: ReadonlyArray<Part<Message> & { readonly content: Html }>
}

interface PopupPanel<Message> {
  readonly backdrop: Part<Message> | undefined
  readonly items: Part<Message> | undefined
  readonly scroll: SlotAttributes<Message> | undefined
  readonly groups: ReadonlyArray<PopupGroup<Message>>
  /** The adapters' own; a fork's upstream markup has none of these. */
  readonly rows?: SlotAttributes<Message> | undefined
  readonly highlight?: SlotAttributes<Message> | undefined
  readonly indicator?: SlotAttributes<Message> | undefined
  /** The overlay bar beside `scroll`, in the panel, and its thumb. */
  readonly scrollBar?: SlotAttributes<Message> | undefined
  readonly scrollThumb?: SlotAttributes<Message> | undefined
}

const drawGroup = <Message>(group: PopupGroup<Message>, h: HtmlBuilder<Message>) => {
  const items = group.items.map(item => h.keyed('div')(item.key, item.attributes, [item.content]))
  if (group.group === undefined) return items
  const heading =
    group.heading === undefined
      ? []
      : [h.keyed('div')(group.heading.id, group.heading.attributes, [group.heading.content])]
  return [
    ...(group.separator === undefined
      ? []
      : [h.keyed('div')(group.separator.key, group.separator.attributes)]),
    h.keyed('div')(group.group.key, group.group.attributes, [...heading, ...items]),
  ]
}

/** The click-away and the panel, present only while open. */
const drawPanel = <Message>(panel: PopupPanel<Message>, h: HtmlBuilder<Message>): Array<Html> => {
  const drawn = panel.groups.flatMap(group => drawGroup(group, h))
  // The rows' own box, which the adapters' Mounts measure from, the overlays first in it.
  const groups =
    panel.rows === undefined
      ? drawn
      : [
          h.div(panel.rows, [
            ...(panel.indicator === undefined
              ? []
              : [h.keyed('div')('indicator', panel.indicator)]),
            ...(panel.highlight === undefined
              ? []
              : [h.keyed('div')('highlight', panel.highlight)]),
            ...drawn,
          ]),
        ]
  return [
    ...(panel.backdrop === undefined
      ? []
      : [h.keyed('div')(panel.backdrop.key, panel.backdrop.attributes)]),
    ...(panel.items === undefined
      ? []
      : [
          h.keyed('div')(
            panel.items.key,
            panel.items.attributes,
            panel.scroll === undefined
              ? groups
              : [
                  h.div(panel.scroll, groups),
                  ...(panel.scrollBar === undefined
                    ? []
                    : [h.div(panel.scrollBar, [h.div(panel.scrollThumb ?? [], [])])]),
                ],
          ),
        ]),
  ]
}

interface Triggered<Message> extends PopupPanel<Message> {
  readonly id: string
  readonly wrapper: SlotAttributes<Message>
  readonly button: SlotAttributes<Message>
  readonly buttonContent: Html
}

export const drawMenu = <Message>(menu: Triggered<Message>, h: HtmlBuilder<Message>): Html =>
  h.div(menu.wrapper, [
    h.keyed('button')(`${menu.id}-button`, menu.button, [menu.buttonContent]),
    ...drawPanel(menu, h),
  ])

export const drawListbox = <Message>(
  listbox: Triggered<Message> & { readonly hiddenInputs: ReadonlyArray<Html> },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(listbox.wrapper, [
    h.keyed('button')(`${listbox.id}-button`, listbox.button, [listbox.buttonContent]),
    ...listbox.hiddenInputs,
    ...drawPanel(listbox, h),
  ])

/**
 * A combobox: its field (the input, its toggle) and its panel, then its form
 * inputs. The adapter's own parts go where `beforeInput`, `afterInput` and
 * `afterPanel` place them: chips, a clear button, a panel of its own beside
 * the list. Upstream's markup has none.
 */
export const drawCombobox = <Message>(
  combobox: PopupPanel<Message> & {
    readonly wrapper: SlotAttributes<Message>
    readonly inputWrapper: SlotAttributes<Message>
    readonly input: SlotAttributes<Message>
    readonly toggleButton: (Part<Message> & { readonly content: Html }) | undefined
    readonly hiddenInputs: ReadonlyArray<Html>
    /** In the field, before the input. */
    readonly beforeInput?: ReadonlyArray<Html> | undefined
    /** In the field, after the input and before the toggle. */
    readonly afterInput?: ReadonlyArray<Html> | undefined
    /** After the panel, before the form inputs. */
    readonly afterPanel?: ReadonlyArray<Html> | undefined
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(combobox.wrapper, [
    h.div(combobox.inputWrapper, [
      ...(combobox.beforeInput ?? []),
      h.input(combobox.input),
      ...(combobox.afterInput ?? []),
      ...(combobox.toggleButton === undefined
        ? []
        : [
            h.keyed('button')(combobox.toggleButton.key, combobox.toggleButton.attributes, [
              combobox.toggleButton.content,
            ]),
          ]),
    ]),
    ...drawPanel(combobox, h),
    ...(combobox.afterPanel ?? []),
    ...combobox.hiddenInputs,
  ])

/**
 * The marks an editable grid over a server shows on a cell, by name, styled
 * on the theme's tokens, with a legend drawn from the same rules: an edit not
 * sent, one saved that the read rows do not show yet, one the server refused,
 * one another device's later edit replaced, and another device's focus.
 * `CellMark.name` stays any string; these are the shared ones.
 */
import { Attr, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { GridSlots } from './slots.js'
import { ref } from './style.js'

export const GridMarks = ['pending', 'saved', 'refused', 'replaced', 'peer'] as const
export type GridMark = (typeof GridMarks)[number]

/** A dot in the top end corner, filled or hollow: an edit on its way. */
const dot = (color: string, hollow: boolean) => ({
  backgroundImage: hollow
    ? `radial-gradient(circle at calc(100% - 6px) 6px, transparent 2px, ${color} 2.5px, ${color} 3.5px, transparent 4px)`
    : `radial-gradient(circle at calc(100% - 6px) 6px, ${color} 3px, transparent 3.5px)`,
})
/** A 2px inset edge, and a ground: something that needs reading. */
const edge = (color: string, ground?: string) => ({
  backgroundImage: 'none',
  boxShadow: `inset 0 0 0 ${ref.border.thick} ${color}`,
  ...(ground === undefined ? {} : { background: ground }),
})

// Edges use the families' ink, which keeps 3:1 against the base surface; a
// peer's colour can be the application's, per person, through --fk-grid-peer.
const looks: Readonly<Record<GridMark, Record<string, string>>> = {
  pending: dot(ref.info.default, false),
  saved: dot(ref.success.ink, true),
  refused: edge(ref.error.ink, ref.error.subtle),
  replaced: edge(ref.warning.ink),
  peer: edge(`var(--fk-grid-peer, ${ref.secondary.default})`, ref.secondary.subtle),
}

/** Each mark's rule on an element carrying `data-mark`, and an outline where colour is forced. */
const marked = Style.compose(
  ...GridMarks.map(mark => Style.nest(`&[data-mark="${mark}"]`, looks[mark])),
  // Forced colours drop box shadows and backgrounds: an outline still says it.
  Style.at(
    '@media (forced-colors: active)',
    Style.nest('&[data-mark]', { outline: `${ref.border.thick} solid CanvasText` }),
  ),
)

export const GridLegendSlots = Slots.define({
  /** The list: labelled, so a screen reader names what the marks are. */
  legend: Slot.make({ attributes: [Attr.AriaLabel] }),
  /** One mark and its words. */
  legendItem: Slot.make({}),
  /** The mark drawn small, as the cells draw it (`data-mark`), hidden from screen readers. */
  legendSwatch: Slot.make({}),
})

/** The words for each mark, and the legend's own label. */
export interface GridLegendWords {
  readonly label: string
  readonly marks: Readonly<Record<GridMark, string>>
}

const words: GridLegendWords = {
  label: 'What the marks on a cell mean',
  marks: {
    pending: 'Not sent yet',
    saved: 'Saved, not yet in the table',
    refused: 'Not saved',
    replaced: 'Replaced by another device',
    peer: 'Another device is here',
  },
}

export interface GridLegendInput {
  /** The marks to explain, in order; all five when omitted. */
  readonly marks?: ReadonlyArray<GridMark>
  readonly words?: GridLegendWords
}

/**
 * A legend of the marks, each beside a swatch drawn by the same rules as the
 * cells (`GridMarkStyle` styles both), so the two cannot drift apart.
 */
export const GridLegend = <Message>() =>
  SlotView.forMessages<Message>().define(
    GridLegendSlots,
    (input: GridLegendInput, slots, h): Html => {
      const said = input.words ?? words
      return h.ul(
        slots.legend.attrs([h.AriaLabel(said.label)]),
        (input.marks ?? GridMarks).map(mark =>
          h.li(slots.legendItem.attrs([]), [
            h.span(
              slots.legendSwatch.attrs([h.DataAttribute('mark', mark), h.AriaHidden(true)]),
              [],
            ),
            said.marks[mark],
          ]),
        ),
      )
    },
  )

/** The marks on the grid's cells. Attach after `GridStyle`, whose plain dot it replaces by name. */
export const GridMarkStyle = Style.forSlots(GridSlots)(
  { cell: marked },
  { layer: Layers.standard.layer('components') },
)

/** The legend's look, its swatches drawn by the cells' own rules. */
export const GridLegendStyle = Style.forSlots(GridLegendSlots)(
  {
    legend: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: `${ref.space['2xs']} ${ref.space.md}`,
      listStyle: 'none',
      margin: '0',
      padding: '0',
      fontSize: ref.size.xs,
      color: ref.text.muted,
    },
    legendItem: { display: 'inline-flex', alignItems: 'center', gap: ref.space.xs },
    legendSwatch: Style.compose(
      Style.inline({
        display: 'inline-block',
        width: '12px',
        height: '12px',
        borderRadius: ref.radius.xs,
      }),
      marked,
    ),
  },
  { layer: Layers.standard.layer('components') },
)

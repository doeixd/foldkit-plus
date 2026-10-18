/**
 * An accordion: a row per section that opens its panel. The panel opens and
 * shuts by animating its one grid row between `0fr` and `1fr`, which needs no
 * measured height (Fluid Functionalism's banner technique): fr resolves from
 * layout, so a scaled ancestor cannot skew it. The chevron points along the
 * row while shut and turns down as it opens, and the open title turns
 * semibold with room kept for it.
 *
 * The axes, each independent of the others:
 *
 * - `variant`: `plain` (the default) rows flush with the page; `bordered` one
 *   box around them all; `separated` each section its own card, apart;
 *   `filled` each section on a muted fill; `ghost` rows that fill under the
 *   pointer and nowhere else.
 * - `separators`: `on` (the default) a hairline between sections, `off`
 *   none. A separated or filled accordion's sections stand apart already and
 *   draw none.
 * - `indicator`: `chevron` (the default) or `plus`, a plus whose upright
 *   turns flat into a minus as it opens. A view's own `icon` is drawn in its
 *   `icon` slot instead, still, with the section's `data-state` to style by.
 * - `indicatorPosition`: `end` (the default) or `start` of the row.
 * - `active`: what an open section tints, Fluid's highlight: `none` (the
 *   default), `trigger` its row, `item` the row and its panel together.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { AccordionSlots } from '../accordion.js'
import {
  component,
  disabled,
  focusRing,
  ref,
  transition,
  travelled,
  turningChevron,
  unfilledHover,
  variant,
  controlHeight,
} from './design.js'

const open = '[data-state="open"]'

/** A row's travel and fade, opening on `tier`'s enter and shutting on its exit. */
const timing = (duration: string, ease: string) => ({
  transitionDuration: `${travelled(duration)}, ${duration}`,
  transitionTimingFunction: `${ease}, ${ease}`,
})

// How far a section's row and panel stand in from its edge; a variant with
// an edge of its own sets it, so the words clear the edge.
const inset = 'var(--_fk-accordion-inset, 0px)'
const separator = `var(--_fk-accordion-separator, ${ref.outline.subtle})`

const apart = (declarations: { readonly [property: string]: string }) => ({
  root: variant(Style.self({ ...declarations, '--_fk-accordion-inset': ladder('row-pad') })),
})

// One bar of the plus, centred in the indicator's box.
const bar = (turn: string) => ({
  content: '""',
  position: 'absolute',
  insetInlineStart: '0',
  insetBlockStart: `calc(50% - ${ref.border.thick} / 2)`,
  inlineSize: '100%',
  blockSize: ref.border.thick,
  borderRadius: ref.radius.full,
  background: 'currentColor',
  rotate: turn,
  transitionProperty: 'rotate',
  transitionDuration: travelled(ref.motion.fast),
  transitionTimingFunction: ref.motion.settle,
})

export const Accordion = Style.recipeFor(AccordionSlots)({
  base: {
    root: component(Style.self({ display: 'flex', flexDirection: 'column' })),
    item: component(Style.self({})),
    heading: component(Style.self({ margin: '0', ...role('body') })),
    trigger: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ladder('gap'),
        inlineSize: '100%',
        minBlockSize: controlHeight,
        paddingBlock: ladder('row-pad'),
        paddingInline: inset,
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        textAlign: 'start',
        cursor: 'pointer',
        ...transition('color, background-color'),
      }),
      Style.pseudo(':hover:not(:disabled)', { color: ref.text.overt }),
      Style.pseudo(open, { color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    label: component(
      Style.self({ display: 'block' }),
      Style.nest(`:where(${open}) > &`, { fontWeight: ref.weight.semibold }),
      Utilities.steady('semibold'),
    ),
    chevron: component(
      turningChevron(open, '0.45em'),
      // Relative for the plus indicator's bars.
      Style.self({ position: 'relative', marginInlineEnd: '0.2em', color: ref.text.muted }),
    ),
    // The view's own icon, a glyph's size, still: what it shows is the application's.
    icon: component(
      Style.self({
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        inlineSize: '1em',
        blockSize: '1em',
        color: ref.text.muted,
      }),
      Style.nest('& > *', { inlineSize: '100%', blockSize: '100%' }),
    ),
    // The one grid row the panel animates; clipped here, on the container,
    // since below 1fr Chrome sizes the track to f squared of its content.
    panel: component(
      Style.self({
        display: 'grid',
        gridTemplateRows: '0fr',
        overflow: 'hidden',
        transitionProperty: 'grid-template-rows, opacity',
        opacity: '0',
        ...timing(ref.motion['fast-exit'], ref.motion['ease-exit']),
      }),
      Style.pseudo(open, {
        gridTemplateRows: '1fr',
        opacity: '1',
        ...timing(ref.motion.fast, ref.motion.ease),
      }),
    ),
    // A grid item is never smaller than its padding, so the row is this, with none.
    body: component(Style.self({ minBlockSize: '0', overflow: 'hidden' })),
    content: component(
      Style.self({
        paddingBlockEnd: ladder('row-pad'),
        paddingInline: inset,
        color: ref.text.muted,
        ...role('body'),
      }),
    ),
  },
  variants: {
    variant: {
      plain: {},
      bordered: {
        root: variant(
          Style.self({
            border: `${ref.border.thin} solid ${ref.outline.default}`,
            borderRadius: ref.radius.lg,
            overflow: 'clip',
            '--_fk-accordion-inset': ladder('row-pad'),
          }),
        ),
      },
      // A ring inside the edge, not a border, so no separator can take its top.
      separated: {
        ...apart({ gap: ref.space.sm, '--_fk-accordion-separator': 'transparent' }),
        item: variant(
          Style.self({
            borderRadius: ref.radius.lg,
            boxShadow: `inset 0 0 0 ${ref.border.thin} ${ref.outline.default}`,
            overflow: 'clip',
          }),
        ),
      },
      filled: {
        ...apart({ gap: ref.space['2xs'], '--_fk-accordion-separator': 'transparent' }),
        item: variant(
          Style.self({
            borderRadius: ref.radius.md,
            background: ref.surface.muted,
            overflow: 'clip',
          }),
        ),
      },
      ghost: {
        root: variant(Style.self({ '--_fk-accordion-inset': ladder('row-pad') })),
        trigger: variant(
          Style.self({ borderRadius: ref.radius.md }),
          Style.pseudo(':is(:hover, :active):not(:disabled)', { background: unfilledHover }),
        ),
      },
    },
    separators: {
      on: {
        item: variant(
          Style.nest('& + &', { borderBlockStart: `${ref.border.thin} solid ${separator}` }),
        ),
      },
      off: {},
    },
    indicator: {
      chevron: {},
      plus: {
        chevron: variant(
          Style.self({
            inlineSize: '0.75em',
            blockSize: '0.75em',
            marginInlineEnd: '0',
            borderWidth: '0',
            // Still in every state and direction, over the chevron's turns in a
            // lower layer; the bars do the turning.
            rotate: '0deg',
          }),
          Style.nest('&::before', bar('0deg')),
          Style.nest('&::after', bar('90deg')),
          // Open, the upright lies flat on the other bar: a minus.
          Style.nest(`:where(${open}) > &::after`, { rotate: '0deg' }),
        ),
      },
    },
    indicatorPosition: {
      end: {},
      start: {
        trigger: variant(Style.self({ flexDirection: 'row-reverse', justifyContent: 'flex-end' })),
      },
    },
    active: {
      none: {},
      trigger: {
        trigger: variant(
          Style.self({ borderRadius: ref.radius.md }),
          Style.pseudo(open, { background: ref.accent.subtle, color: ref.accent.ink }),
        ),
      },
      item: {
        item: variant(Style.pseudo(open, { background: ref.accent.subtle })),
        trigger: variant(Style.pseudo(open, { color: ref.accent.ink })),
        root: variant(Style.self({ '--_fk-accordion-inset': ladder('row-pad') })),
      },
    },
  },
  defaults: {
    variant: 'plain',
    separators: 'on',
    indicator: 'chevron',
    indicatorPosition: 'end',
    active: 'none',
  },
})

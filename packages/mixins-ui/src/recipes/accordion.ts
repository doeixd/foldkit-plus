/**
 * An accordion: a row per section that opens its panel. The panel opens and
 * shuts by animating its one grid row between `0fr` and `1fr`, which needs no
 * measured height (Fluid Functionalism's banner technique): fr resolves from
 * layout, so a scaled ancestor cannot skew it. The chevron points along the
 * row while shut and turns down as it opens, and the open title turns
 * semibold with room kept for it. `variant` draws lines between the sections
 * (`divided`) or none (`plain`).
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { AccordionSlots } from '../accordion.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  ref,
  transition,
  travelled,
  variant,
} from './design.js'

const open = '[data-state="open"]'

/** A row's travel and fade, opening on `tier`'s enter and shutting on its exit. */
const timing = (duration: string, ease: string) => ({
  transitionDuration: `${travelled(duration)}, ${duration}`,
  transitionTimingFunction: `${ease}, ${ease}`,
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
        minBlockSize: ladder('height'),
        paddingBlock: ladder('row-pad'),
        paddingInline: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        textAlign: 'start',
        cursor: 'pointer',
        ...transition('color'),
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
    // Two sides of a box, turned: along the row while shut, down when open.
    chevron: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.45em',
        blockSize: '0.45em',
        marginInlineEnd: '0.2em',
        ...cornerSides(ref.border.thick, 'currentColor'),
        color: ref.text.muted,
        rotate: '-45deg',
        transitionProperty: 'rotate',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.settle,
      }),
      Style.nest(`:where(${open}) > &`, { rotate: '45deg' }),
      // Right to left, along the row is the other way.
      Style.nest(':where([dir="rtl"]) &', { rotate: '135deg' }),
      Style.nest(`:where([dir="rtl"]) :where(${open}) > &`, { rotate: '45deg' }),
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
        color: ref.text.muted,
        ...role('body'),
      }),
    ),
  },
  variants: {
    variant: {
      divided: {
        item: variant(
          Style.self({ borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}` }),
        ),
      },
      plain: { item: variant(Style.self({})) },
    },
  },
  defaults: { variant: 'divided' },
})

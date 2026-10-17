/**
 * Cascade Select: the Listbox's trigger (its value, muted while it is the
 * placeholder, before a chevron that turns while open) and the popups'
 * panel, holding a column per level side by side, each capped and
 * scrolling on its own, with a hairline between. A row is the popups' row:
 * lit where the keys or the pointer are, tinted with the accent when it is
 * the chosen option, in the panel's ink with a quiet tint while it is a
 * branch on the open path. A row with children ends in a chevron toward
 * the inline end, which points the other way right to left. Drilled in
 * (`layout: 'drill'`, or columns too wide for the window), one column
 * shows, under a back row. The panel is never wider than the window.
 *
 * `size` steps the trigger and the rows together, on the root and the
 * panel both; `trigger` is the button's look, as the Listbox's.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { CascadeSelectSlots } from '../cascadeSelect.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  hover,
  listScroll,
  onLadder,
  ref,
  steps,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'
import { backdrop, heading, item, panel, triggerWidth, unlit } from './popup.js'

/** A line in the panel's own ink, as the popups' separator draws it. */
const line = `color-mix(in oklab, ${ref.popup.ink} 14%, transparent)`

/** Two sides of a box, turned into a chevron. */
const chevron = (turn: string) =>
  Style.self({
    flex: 'none',
    inlineSize: '0.45em',
    blockSize: '0.45em',
    ...cornerSides(ref.border.thick, 'currentColor'),
    rotate: turn,
  })

export const CascadeSelect = Style.recipeFor(CascadeSelectSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space['2xs'],
      }),
    ),
    trigger: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ladder('gap'),
        minInlineSize: '12rem',
        ...onLadder,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.default,
        font: 'inherit',
        cursor: 'pointer',
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
      Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
      focusRing,
      disabled,
    ),
    valueText: component(
      Style.self({
        flex: '1',
        overflow: 'hidden',
        textAlign: 'start',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      Style.states({ true: { color: ref.text.muted } }, 'data-placeholder'),
    ),
    chevron: component(
      chevron('45deg'),
      Style.self({
        marginBlockEnd: '0.2em',
        color: ref.text.muted,
        transitionProperty: 'rotate, margin',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.settle,
      }),
      Style.nest(':where([aria-expanded="true"]) &', {
        rotate: '225deg',
        marginBlockEnd: '0',
        marginBlockStart: '0.2em',
      }),
    ),
    // A cross of two bars in a round ghost button.
    clear: component(
      Style.self({
        position: 'relative',
        flex: 'none',
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      Style.nest('&::before, &::after', {
        content: '""',
        position: 'absolute',
        insetInlineStart: '50%',
        insetBlockStart: '50%',
        inlineSize: '0.6em',
        blockSize: ref.border.thick,
        background: 'currentColor',
        translate: '-50% -50%',
        rotate: '45deg',
      }),
      Style.nest('&::after', { rotate: '-45deg' }),
      hover({ background: unfilledHover, color: ref.text.default }),
      focusRing,
    ),
    input: component(Style.self({ display: 'none' })),
    layer: component(Style.self({})),
    backdrop,
    panel: component(
      panel,
      Style.self({
        display: 'flex',
        alignItems: 'stretch',
        padding: '0',
        // Columns that would not fit drill in when the popup opens; a window narrowed
        // while it is open scrolls the panel rather than running it off the screen.
        maxInlineSize: `calc(100vw - 2 * ${ref.space.xs})`,
        overflowX: 'auto',
      }),
    ),
    column: component(
      listScroll,
      Style.self({
        minInlineSize: '11rem',
        maxBlockSize: '18rem',
        overflowY: 'auto',
        padding: ref.space['2xs'],
      }),
      Style.nest('& + &', { borderInlineStart: `${ref.border.thin} solid ${line}` }),
    ),
    heading,
    back: component(
      item,
      Style.self({
        gap: ladder('gap'),
        color: `color-mix(in oklab, ${ref.popup.ink} 62%, transparent)`,
      }),
      Style.nest('&::before', {
        content: '""',
        ...chevron('135deg'),
        marginInlineStart: '0.2em',
      }),
      Style.nest(':dir(rtl) &::before', { rotate: '-45deg' }),
    ),
    item: component(
      item,
      Style.self({ gap: ladder('gap') }),
      // A branch on the open path, which the column beside it shows the children of.
      Style.nest(`${unlit}[aria-expanded="true"]:not([data-active])`, {
        background: `color-mix(in oklab, ${ref.popup.ink} 7%, transparent)`,
      }),
      Style.states({ true: { color: ref.accent.ink } }, 'aria-selected'),
      Style.nest(`${unlit}[aria-selected="true"]:not([data-active])`, {
        background: ref.accent.subtle,
      }),
      Style.pseudo('[data-on-path]', { fontWeight: ref.weight.medium }),
    ),
    itemText: component(
      Style.self({
        flex: '1',
        minInlineSize: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
    ),
    branch: component(
      chevron('-45deg'),
      Style.self({ marginInlineEnd: '0.2em', opacity: '0.6' }),
      Style.nest(':dir(rtl) &', { rotate: '135deg' }),
    ),
  },
  variants: {
    size: {
      sm: { root: steps.sm, panel: steps.sm },
      md: { root: steps.md, panel: steps.md },
      lg: { root: steps.lg, panel: steps.lg },
    },
    trigger: {
      outline: {},
      filled: {
        trigger: variant(Style.self({ background: ref.surface.field, borderColor: 'transparent' })),
      },
      ghost: {
        trigger: variant(
          Style.self({ background: 'transparent', borderColor: 'transparent' }),
          Style.pseudo(':hover:not(:disabled, [aria-disabled="true"])', {
            background: unfilledHover,
            borderColor: 'transparent',
          }),
        ),
      },
    },
    width: {
      /** The panel at least as wide as the trigger. */
      trigger: { panel: triggerWidth },
      auto: {},
    },
  },
  defaults: { trigger: 'outline', width: 'auto' },
})

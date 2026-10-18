/**
 * A segmented control: a tray of toggle buttons where pressing selects, or
 * (`tray: 'underline'`) a row of them over a rule, the pressed one
 * underlined as a tab. `size` is its step on the ladder, and `width:
 * 'fill'` stretches it across its container in equal options. The
 * pressed option takes the accent's tint, flat: that rule lives on the group
 * (`> [aria-pressed="true"]`), so icon tiles take the group piece alone and
 * share it with text options. It is in the variants layer, so an option drawn
 * by another recipe (an icon button, whose own background is a variant) still
 * shows it. The tray sets no `display`: the Builder owns its narrow tabs'
 * visibility, and every other tray lays itself out.
 */
import { Style } from 'foldkit-mixins'
import { SegmentedSlots } from '../segmented.js'
import { ladder, nested, nests } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import {
  component,
  glide,
  hover,
  onLadder,
  ref,
  steps,
  trimmed,
  unfilledHover,
  variant,
} from './design.js'

const pressed = '[aria-pressed="true"]'
const lit = ':where([data-fluid-hover]) > &'
/** An option's height inside the tray's inset, so the tray as a whole is one rung tall. */
const optionHeight = `calc(${ladder('height')} - 2 * var(--_fk-segmented-inset, 0px))`
const at = (name: 'hover' | 'chosen', part: 'x' | 'y' | 'w' | 'h') =>
  `var(--fk-segmented-${name}-${part})`

const overlay = (name: 'hover' | 'chosen') =>
  Style.self({
    position: 'absolute',
    // Physical: the Mounts measure from the left, in either direction.
    top: '0',
    left: '0',
    zIndex: '-1',
    display: 'none',
    inlineSize: at(name, 'w'),
    blockSize: at(name, 'h'),
    translate: `${at(name, 'x')} ${at(name, 'y')}`,
    // The option's corner, which it marks: a fixed `sm` met the option's at
    // no tray inset but one.
    borderRadius: nested(),
    pointerEvents: 'none',
  })

export const Segmented = Style.recipeFor(SegmentedSlots)({
  base: {
    group: variant(
      // A positioned box for the indicator and highlight, under the options.
      Style.self({ position: 'relative', isolation: 'isolate' }),
      // One pressed rule for text and icon tiles alike; its fill is the
      // indicator's once `Segmented.fluid` runs.
      Style.nest(`> ${pressed}`, {
        boxShadow: 'none',
        color: ref.accent.ink,
        cursor: 'default',
        fontWeight: ref.weight.semibold,
      }),
      Style.nest(`&:not([data-fluid-hover]) > ${pressed}`, { background: ref.accent.subtle }),
    ),
    indicator: component(
      overlay('chosen'),
      Style.self({ background: ref.accent.subtle, ...glide('moderate', '1') }),
      Style.nest(lit, { display: 'var(--fk-segmented-chosen-display, none)' }),
    ),
    highlight: component(
      overlay('hover'),
      Style.self({
        background: ref.accent.subtle,
        opacity: 'calc(0.4 * var(--fk-segmented-hover-shown))',
        ...glide('fast', 'var(--fk-segmented-hover-moving)'),
      }),
      Style.nest(lit, { display: 'block' }),
    ),
    option: component(
      Style.self({
        ...onLadder,
        // Enough for an option with no steady copy; one with a copy needs its `label`.
        ...trimmed,
        minBlockSize: optionHeight,
        background: 'transparent',
        border: '0',
        // Concentric with the tray's corner, inside its inset.
        borderRadius: nested(),
        color: ref.text.muted,
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: ref.weight.medium,
      }),
      hover({ color: ref.text.overt }),
      // A pressed option turns semibold; a `data-label` on it keeps its width.
      Utilities.steady('semibold'),
      // Its steady copy holds the words alone: room for the icon beside them too.
      Style.nest('&[data-icon=""][data-label]::after', {
        paddingInlineStart: `calc(${ladder('icon')} + ${ladder('gap')})`,
      }),
      // An icon alone, in a square.
      Style.pseudo('[data-icon="only"]', { inlineSize: optionHeight, paddingInline: '0' }),
    ),
    content: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: ladder('gap'),
      }),
    ),
    icon: component(
      Style.self({
        display: 'inline-flex',
        flexShrink: '0',
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
        verticalAlign: 'middle',
      }),
    ),
    // The words trimmed in a block of their own. On the option alone, the
    // steady copy after them was its last line and took the bottom trim, so
    // only the top of the words was trimmed and they sat 2.5px high.
    label: component(Style.self({ display: 'block', ...trimmed })),
  },
  variants: {
    tray: {
      tray: {
        group: variant(
          Style.self({
            '--_fk-segmented-inset': ladder('inset'),
            // As wide as its options, as an inline control: a block's width left the tray running on.
            inlineSize: 'fit-content',
            background: ref.surface.muted,
            // A pressable control's corner, so a pill theme rounds the tray too.
            borderRadius: ref.radius.control,
            gap: '2px',
            padding: 'var(--_fk-segmented-inset)',
            ...nests(ref.radius.control, 'var(--_fk-segmented-inset)'),
          }),
        ),
      },
      // No tray: the options keep the tray's corner, with nothing between.
      plain: {
        group: variant(
          Style.self({ display: 'flex', gap: ref.space['3xs'], ...nests(ref.radius.md, '0px') }),
        ),
      },
      // A rule under the options, the pressed one underlined in the accent, as a tab.
      underline: {
        group: variant(
          Style.self({
            display: 'flex',
            gap: ref.space['3xs'],
            boxShadow: `inset 0 calc(-1 * ${ref.border.thin}) 0 ${ref.outline.default}`,
            ...nests(ref.radius.md, '0px'),
          }),
          Style.nest(`> ${pressed}`, { color: ref.text.overt }),
          Style.nest(`&:not([data-fluid-hover]) > ${pressed}`, {
            background: 'transparent',
            boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,
          }),
        ),
        indicator: variant(
          Style.self({
            blockSize: ref.border.thick,
            translate: `${at('chosen', 'x')} calc(${at('chosen', 'y')} + ${at('chosen', 'h')} - ${ref.border.thick})`,
            borderRadius: '0',
            background: ref.accent.default,
          }),
        ),
        highlight: variant(
          Style.self({ background: unfilledHover, opacity: 'var(--fk-segmented-hover-shown)' }),
        ),
      },
    },
    size: {
      lg: { group: steps.lg, option: steps.lg },
      md: { group: steps.md, option: steps.md },
      sm: { group: steps.sm, option: steps.sm },
      // Below the ladder, for a tool strip in a crowded panel: 24px.
      xs: {
        group: variant(Style.self({ '--fk-knob-step': '1.5' })),
        option: variant(Style.self({ '--fk-knob-step': '1.5' })),
      },
    },
    width: {
      // Across its container, every option as wide as the widest.
      fill: {
        group: variant(
          Style.self({
            display: 'grid',
            gridAutoFlow: 'column',
            gridAutoColumns: '1fr',
            inlineSize: 'auto',
          }),
        ),
      },
    },
  },
  defaults: { tray: 'tray' },
})

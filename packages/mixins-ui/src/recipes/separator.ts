/**
 * A thematic break: a line along the layout axis, never interactive. The
 * orientation axis mirrors the view option so the rule and the role agree.
 * The line is a border, so `line` can dash or dot it and `thickness` thicken
 * it; it is drawn in the default outline, which a dark page still shows (the
 * subtle one all but vanished there). `spacing` is the room before and after
 * it, `inset` how far it stops short of its container's sides. A labelled
 * separator lays its two rules either side of the words.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { SeparatorSlots } from '../separator.js'
import { component, ref, variant } from './design.js'

// Read with their defaults, so a labelled frame's choice reaches the rules inside it.
const width = `var(--_fk-separator-width, ${ref.border.thin})`
const style = 'var(--_fk-separator-style, solid)'
const color = ref.outline.default
const set = (property: string, value: string) => ({
  rule: variant(Style.self({ [property]: value })),
  root: variant(Style.self({ [property]: value })),
})

// Across the line, the room is the spacing; along it, the inset. A rule in a
// labelled frame takes neither: the frame does.
const space = 'var(--_fk-separator-space, 0px)'
const inset = 'var(--_fk-separator-inset, 0px)'
const horizontal = { marginBlock: space, marginInline: inset }
const vertical = { marginInline: space, marginBlock: inset }
const framed = Style.nest('&[aria-hidden="true"]', { margin: '0' })

export const Separator = Style.recipeFor(SeparatorSlots)({
  base: {
    rule: component(
      Style.self({ border: '0', flex: 'none' }),
      Style.nest('&[aria-hidden="true"]', { flex: '1 1 0' }),
    ),
    root: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.sm,
      }),
    ),
    label: component(
      Style.self({
        flex: 'none',
        ...role('caption'),
        color: ref.text.muted,
        whiteSpace: 'nowrap',
      }),
    ),
  },
  variants: {
    orientation: {
      horizontal: {
        rule: variant(
          Style.self({
            inlineSize: `calc(100% - 2 * ${inset})`,
            blockSize: '0',
            borderBlockStart: `${width} ${style} ${color}`,
            ...horizontal,
          }),
          framed,
        ),
        root: variant(Style.self(horizontal)),
      },
      vertical: {
        rule: variant(
          Style.self({
            inlineSize: '0',
            blockSize: `calc(100% - 2 * ${inset})`,
            alignSelf: 'stretch',
            borderInlineStart: `${width} ${style} ${color}`,
            ...vertical,
          }),
          framed,
        ),
        root: variant(Style.self({ flexDirection: 'column', alignSelf: 'stretch', ...vertical })),
      },
    },
    line: {
      solid: {},
      dashed: set('--_fk-separator-style', 'dashed'),
      dotted: set('--_fk-separator-style', 'dotted'),
    },
    thickness: {
      thin: {},
      thick: set('--_fk-separator-width', ref.border.thick),
    },
    spacing: {
      none: {},
      sm: set('--_fk-separator-space', ref.space.xs),
      md: set('--_fk-separator-space', ref.space.md),
      lg: set('--_fk-separator-space', ref.space.xl),
    },
    inset: {
      none: {},
      sm: set('--_fk-separator-inset', ref.space.sm),
      md: set('--_fk-separator-inset', ref.space.lg),
    },
  },
  defaults: {
    orientation: 'horizontal',
    line: 'solid',
    thickness: 'thin',
    spacing: 'none',
    inset: 'none',
  },
})

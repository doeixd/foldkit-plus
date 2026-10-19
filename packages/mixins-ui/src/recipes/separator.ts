/**
 * A thematic break: a line along the layout axis, never interactive. The
 * view writes its orientation (`data-orientation`) on the rule and the frame,
 * and the recipe reads it, so one style draws both and they cannot disagree.
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
const vertical = '&[data-orientation="vertical"]'

export const Separator = Style.recipeFor(SeparatorSlots)({
  base: {
    rule: component(
      Style.self({
        flex: 'none',
        inlineSize: `calc(100% - 2 * ${inset})`,
        blockSize: '0',
        borderBlockStart: `${width} ${style} ${color}`,
        marginBlock: space,
        marginInline: inset,
      }),
      // Stood up, the rule stretches across a flex or grid row, and never
      // shrinks below the words' size: in running text, or in a row that
      // cannot stretch it, it stands as tall as the letters beside it,
      // inside the line, so the line keeps its height.
      Style.nest(vertical, {
        display: 'inline-block',
        verticalAlign: 'text-bottom',
        alignSelf: 'stretch',
        inlineSize: '0',
        blockSize: `calc(100% - 2 * ${inset})`,
        minBlockSize: '1em',
        borderBlockStart: '0',
        borderInlineStart: `${width} ${style} ${color}`,
        marginBlock: inset,
        marginInline: space,
      }),
      Style.nest('&[aria-hidden="true"]', { flex: '1 1 0' }),
      // In a labelled frame the rules share what the words leave.
      Style.nest('&[data-orientation][aria-hidden="true"]', { margin: '0', minBlockSize: '0' }),
    ),
    root: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.sm,
        marginBlock: space,
        marginInline: inset,
      }),
      Style.nest(vertical, {
        flexDirection: 'column',
        alignSelf: 'stretch',
        marginBlock: inset,
        marginInline: space,
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
    line: 'solid',
    thickness: 'thin',
    spacing: 'none',
    inset: 'none',
  },
})

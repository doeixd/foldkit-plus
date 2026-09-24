/**
 * `foldkit-mixins/layout`: layout pieces (stack, cluster, sidebar, …) as
 * `StyleValue`s. Each entry's rule text is the same for every caller: the
 * rules read `--fk-l-*` custom properties with token fallbacks, and the
 * options only write those properties inline. Ten stacks with ten gaps are
 * one rule and ten inline variables. The pieces are unlayered; a page puts
 * them in `layouts` with `Layers.standard.in`.
 *
 * Two things a query cannot read from a variable are structural instead:
 * `split`'s breakpoint (a `@container` or `@media` query) and `stack`'s
 * `split` index (an `:nth-child`). Those are part of the rule text, so each
 * distinct value is its own class.
 */
import * as Rules from './styleRules.js'
import {
  compose,
  container,
  empty,
  media,
  nest,
  pseudo,
  self,
  vars,
  type Declarations,
  type StyleValue,
} from './styleValue.js'

/** The generated class of a rule-only piece, for another piece's selector. */
const classOf = (piece: StyleValue): string => Rules.className(piece.rules ?? [])

const GAP = 'var(--fk-l-gap, var(--fk-space-md, 1rem))'

const gapVar = (gap: string | undefined): StyleValue =>
  gap === undefined ? empty : vars({ '--fk-l-gap': gap })

/**
 * A child of `stack` that keeps its intrinsic width instead of the stack's
 * full-width default. The stack's child rule excludes this piece's class.
 */
export const intrinsic: StyleValue = self({
  flexGrow: '0',
  inlineSize: 'fit-content',
  maxInlineSize: 'max-content',
  alignSelf: 'var(--fk-l-intrinsic-align, flex-start)',
})

export interface StackOptions {
  readonly gap?: string
  /** `align-items`; children are full width unless they compose `intrinsic`. */
  readonly align?: string
  /** Children after this one-based index are pushed to the end (`margin-block-start: auto`). */
  readonly split?: number
}

/** A vertical stack that owns its children's block rhythm. */
export const stack = (options: StackOptions = {}): StyleValue =>
  compose(
    self({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'var(--fk-l-align, stretch)',
      gap: GAP,
    }),
    nest(`> :not(.${classOf(intrinsic)})`, { inlineSize: '100%', marginBlock: '0' }),
    options.split === undefined
      ? empty
      : nest(`> :nth-child(${options.split})`, { marginBlockEnd: 'auto' }),
    gapVar(options.gap),
    options.align === undefined ? empty : vars({ '--fk-l-align': options.align }),
  )

export interface ClusterOptions {
  readonly gap?: string
  readonly justify?: string
  readonly align?: string
}

/** Items that wrap onto new lines: tags, toolbar buttons, metadata. */
export const cluster = (options: ClusterOptions = {}): StyleValue =>
  compose(
    self({
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'var(--fk-l-gap, var(--fk-space-sm, 0.75rem))',
      justifyContent: 'var(--fk-l-justify, flex-start)',
      alignItems: 'var(--fk-l-align, center)',
    }),
    gapVar(options.gap),
    options.justify === undefined ? empty : vars({ '--fk-l-justify': options.justify }),
    options.align === undefined ? empty : vars({ '--fk-l-align': options.align }),
  )

export interface SplitOptions {
  /** The column template above the breakpoint, e.g. `'1fr 2fr'`. */
  readonly fraction?: string
  /** The container (or, with `contain: false`, viewport) width the columns appear at. */
  readonly breakpoint?: string
  readonly gap?: string
  /** `false` adapts on the viewport with `@media` and sets no containment. */
  readonly contain?: boolean
}

/** Two columns above a breakpoint, one below. */
export const split = (options: SplitOptions = {}): StyleValue => {
  const breakpoint = options.breakpoint ?? '30rem'
  const query = `(min-width: ${breakpoint})`
  const columns = { gridTemplateColumns: 'var(--fk-l-fraction, 1fr 1fr)' }
  return compose(
    self({ display: 'grid', gap: GAP, gridTemplateColumns: '1fr' }),
    options.contain === false
      ? media(query, columns)
      : compose(self({ containerType: 'inline-size' }), container(query, columns)),
    gapVar(options.gap),
    options.fraction === undefined ? empty : vars({ '--fk-l-fraction': options.fraction }),
  )
}

/**
 * The aside of a `sidebar`: composed by the child that is the sidebar. The
 * other children are the content.
 */
export const aside: StyleValue = self({
  flexGrow: '1',
  flexBasis: 'var(--fk-l-side-width, 20rem)',
})

export interface SidebarOptions {
  /** Which side the `aside` child sits on when the row fits. */
  readonly side?: 'start' | 'end'
  /** The aside's preferred width. */
  readonly width?: string
  /** The content's minimum share; below it the aside wraps under. */
  readonly contentMin?: string
  readonly gap?: string
}

/**
 * A sidebar beside content that wraps under it when the content would get
 * less than `contentMin`. Flex math, no query, so it needs no containment.
 */
export const sidebar = (options: SidebarOptions = {}): StyleValue =>
  compose(
    self({ display: 'flex', flexWrap: 'wrap', gap: GAP }),
    nest(`> :not(.${classOf(aside)})`, {
      flexGrow: '9999',
      flexBasis: 'var(--fk-l-content-min, 50%)',
    }),
    options.side === 'end' ? nest(`> .${classOf(aside)}`, { order: '1' }) : empty,
    gapVar(options.gap),
    options.width === undefined ? empty : vars({ '--fk-l-side-width': options.width }),
    options.contentMin === undefined ? empty : vars({ '--fk-l-content-min': options.contentMin }),
  )

export interface SwitcherOptions {
  /** The container width below which the items stack. */
  readonly threshold?: string
  readonly gap?: string
}

/** A row that becomes a stack when narrower than `threshold`. Flex math, no query. */
export const switcher = (options: SwitcherOptions = {}): StyleValue =>
  compose(
    self({ display: 'flex', flexWrap: 'wrap', gap: GAP }),
    nest('> *', {
      flexGrow: '1',
      flexBasis: 'calc((var(--fk-l-threshold, 30rem) - 100%) * 999)',
    }),
    gapVar(options.gap),
    options.threshold === undefined ? empty : vars({ '--fk-l-threshold': options.threshold }),
  )

export interface ReelOptions {
  /** Each item's inline size; `auto` sizes to content. */
  readonly itemSize?: string
  readonly gap?: string
  /** Snap items to the start edge while scrolling. */
  readonly snap?: boolean
  readonly scrollbar?: 'auto' | 'thin' | 'hidden'
}

const scrollbars: Readonly<Record<NonNullable<ReelOptions['scrollbar']>, StyleValue>> = {
  auto: empty,
  thin: self({ scrollbarWidth: 'thin' }),
  hidden: compose(
    self({ scrollbarWidth: 'none' }),
    pseudo('::-webkit-scrollbar', { display: 'none' }),
  ),
}

/** A horizontally scrolling row. */
export const reel = (options: ReelOptions = {}): StyleValue =>
  compose(
    self({
      display: 'flex',
      inlineSize: '100%',
      minInlineSize: '0',
      maxInlineSize: '100%',
      gap: GAP,
      overflowX: 'auto',
      overflowY: 'hidden',
      overscrollBehaviorInline: 'contain',
    }),
    nest('> *', { flex: '0 0 var(--fk-l-item-size, auto)' }),
    options.snap === true
      ? compose(
          self({ scrollSnapType: 'inline proximity' }),
          nest('> *', { scrollSnapAlign: 'start' }),
        )
      : empty,
    scrollbars[options.scrollbar ?? 'auto'],
    gapVar(options.gap),
    options.itemSize === undefined ? empty : vars({ '--fk-l-item-size': options.itemSize }),
  )

export interface CenterOptions {
  /** The measure; default `65ch`. */
  readonly max?: string
  readonly gutters?: string
  /** Also center the children by their intrinsic width. */
  readonly intrinsic?: boolean
}

/** Content centered inline with a maximum measure and gutters. */
export const center = (options: CenterOptions = {}): StyleValue =>
  compose(
    self({
      boxSizing: 'border-box',
      marginInline: 'auto',
      maxInlineSize: 'var(--fk-l-max, 65ch)',
      paddingInline: 'var(--fk-l-gutters, var(--fk-space-md, 1rem))',
    }),
    options.intrinsic === true
      ? self({ display: 'flex', flexDirection: 'column', alignItems: 'center' })
      : empty,
    options.max === undefined ? empty : vars({ '--fk-l-max': options.max }),
    options.gutters === undefined ? empty : vars({ '--fk-l-gutters': options.gutters }),
  )

export interface FrameOptions {
  /** An `aspect-ratio`, e.g. `'16 / 9'`. */
  readonly ratio?: string
}

/** A media frame with a fixed aspect ratio; an `img` or `video` child covers it. */
export const frame = (options: FrameOptions = {}): StyleValue =>
  compose(
    self({ position: 'relative', overflow: 'hidden', aspectRatio: 'var(--fk-l-ratio, 16 / 9)' }),
    nest('> :is(img, video)', {
      position: 'absolute',
      inset: '0',
      inlineSize: '100%',
      blockSize: '100%',
      objectFit: 'cover',
    }),
    options.ratio === undefined ? empty : vars({ '--fk-l-ratio': options.ratio }),
  )

export interface PadOptions {
  readonly inline?: string
  readonly block?: string
}

/** Consistent padding from the space tokens. */
export const pad = (options: PadOptions = {}): StyleValue =>
  compose(
    self({
      paddingInline: 'var(--fk-l-pad-inline, var(--fk-space-md, 1rem))',
      paddingBlock: 'var(--fk-l-pad-block, var(--fk-space-md, 1rem))',
    }),
    options.inline === undefined ? empty : vars({ '--fk-l-pad-inline': options.inline }),
    options.block === undefined ? empty : vars({ '--fk-l-pad-block': options.block }),
  )

export interface AutoGridOptions {
  /** The narrowest an item may be before the grid drops a column. */
  readonly minItemSize?: string
  readonly gap?: string
}

/** A grid that fits as many `minItemSize` columns as the width allows. */
export const autoGrid = (options: AutoGridOptions = {}): StyleValue =>
  compose(
    self({
      display: 'grid',
      gap: GAP,
      gridTemplateColumns:
        'repeat(auto-fit, minmax(min(100%, var(--fk-l-min-item-size, 16rem)), 1fr))',
    }),
    gapVar(options.gap),
    options.minItemSize === undefined
      ? empty
      : vars({ '--fk-l-min-item-size': options.minItemSize }),
  )

export const Layout = {
  stack,
  intrinsic,
  cluster,
  split,
  sidebar,
  aside,
  switcher,
  reel,
  center,
  frame,
  pad,
  autoGrid,
} as const

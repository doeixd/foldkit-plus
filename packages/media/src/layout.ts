import { Schema } from 'effect'
import type { ImageAsset } from './asset.js'
import { atLeast, type Widths } from './widths.js'

const CssPixels = Schema.Number.check(Schema.isGreaterThan(0))

/** How wide an image is drawn, from which its candidates and `sizes` follow. */
const LayoutSchema = Schema.TaggedUnion({
  /** Always this many CSS pixels wide. */
  Fixed: { width: CssPixels },
  /** At most this wide, and the viewport's width when that is narrower. */
  Constrained: { width: CssPixels },
  /** The viewport's width. */
  FullWidth: {},
})
export { LayoutSchema as Schema }
export type Layout = typeof LayoutSchema.Type

export const Fixed = LayoutSchema.cases.Fixed.make
export const Constrained = LayoutSchema.cases.Constrained.make
export const FullWidth = (): Layout => LayoutSchema.cases.FullWidth.make({})

/**
 * One `srcset` entry: the ladder width asked of the provider, and the width
 * the answer has. They differ only above the original's own width, where a
 * provider that does not enlarge answers with the original's.
 */
export interface Candidate {
  readonly request: number
  readonly described: number
}

/**
 * The widths worth offering for `layout`: for a fixed image its 1x and 2x,
 * for a constrained one every width up to its 2x, for a full-width one the
 * whole ladder. Widths above the original fetch the original's pixels, so
 * only the first of them is kept.
 */
export const candidates = (
  layout: Layout,
  widths: Widths,
  intrinsic: number,
): ReadonlyArray<Candidate> => {
  const wanted = LayoutSchema.match(layout, {
    Fixed: ({ width }) => [atLeast(widths, width), atLeast(widths, 2 * width)],
    Constrained: ({ width }) => {
      const top = atLeast(widths, 2 * width)
      return widths.values.filter(value => value <= top)
    },
    FullWidth: () => widths.values,
  })
  const result: Array<Candidate> = []
  for (const request of wanted) {
    const described = Math.min(request, intrinsic)
    if (result.at(-1)?.described !== described) result.push({ request, described })
  }
  return result
}

/** The `sizes` a layout implies: how wide the image is drawn at each viewport. */
export const sizes = (layout: Layout): string =>
  LayoutSchema.match(layout, {
    Fixed: ({ width }) => `${width}px`,
    Constrained: ({ width }) => `(min-width: ${width}px) ${width}px, 100vw`,
    FullWidth: () => '100vw',
  })

/**
 * The `width` and `height` attributes: the drawn size where the layout fixes
 * one, the original's where it does not. Either way their ratio is the
 * original's, which is what reserves the box before a byte arrives.
 */
export const box = (
  layout: Layout,
  asset: Pick<ImageAsset, 'width' | 'height'>,
): { readonly width: number; readonly height: number } => {
  const scaled = (width: number) => ({
    width: Math.round(width),
    height: Math.round((width * asset.height) / asset.width),
  })
  return LayoutSchema.match(layout, {
    Fixed: ({ width }) => scaled(width),
    Constrained: ({ width }) => scaled(width),
    FullWidth: () => ({ width: asset.width, height: asset.height }),
  })
}

/**
 * The ids a transition and a law have in evidence and in Surface's graph. A
 * module of their own, so a Remote domain naming its laws for the graph does
 * not carry `Laws.check`.
 */

/** A declared write's id: `write:Sell`. The function `Laws.transition` is. */
export const transitionId = (entry: { readonly name: string }): string => `write:${entry.name}`

/** An invariant's id: `Product.reservedWithinStock`. The function `Laws.law` is. */
export const lawId = (invariant: { readonly id: string; readonly entity: string }): string =>
  `${invariant.entity}.${invariant.id}`

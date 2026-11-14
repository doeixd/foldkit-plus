/** Ported from `effect-atom-jsx/src/View.ts` `pipeSelf`. */
export const pipeSelf = (self: unknown, fns: ReadonlyArray<(value: any) => any>): unknown =>
  fns.reduce((acc, fn) => fn(acc), self)

/**
 * Typed steps, as Effect's `pipe`, and no catch-all of `(self: Self) => Self`:
 * a step that changes the type (an attachment that supplies obligations, a
 * `detach` that forgets them) would be read back as `Self` and keep what it
 * changed, so a later `A11y.conform` would judge the view before the change.
 */
export type Pipeable<Self> = {
  pipe(): Self
  pipe<A>(ab: (self: Self) => A): A
  pipe<A, B>(ab: (self: Self) => A, bc: (a: A) => B): B
  pipe<A, B, C>(ab: (self: Self) => A, bc: (a: A) => B, cd: (b: B) => C): C
  pipe<A, B, C, D>(ab: (self: Self) => A, bc: (a: A) => B, cd: (b: B) => C, de: (c: C) => D): D
  pipe<A, B, C, D, E>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
  ): E
  pipe<A, B, C, D, E, F>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
  ): F
  pipe<A, B, C, D, E, F, G>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
  ): G
  pipe<A, B, C, D, E, F, G, H>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
  ): H
}

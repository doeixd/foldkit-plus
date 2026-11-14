/** Ported from `effect-atom-jsx/src/View.ts` `pipeSelf`. */
export const pipeSelf = (self: unknown, fns: ReadonlyArray<(value: any) => any>): unknown =>
  fns.reduce((acc, fn) => fn(acc), self)

/**
 * Typed steps first, as Effect's `pipe`, so a step that changes the type (an
 * attachment that supplies obligations) keeps the change. The catch-all of
 * `(self: Self) => Self` comes last, for a spread array of transforms; when
 * the typed steps refuse a call it reads every step as `Self`, so on a view
 * that already supplies an obligation, a `detach` and an `A11y.conform` in one
 * call judge the view before the detach (the run-time check still refuses
 * it). Effect's `pipe` has no catch-all.
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
  pipe(...fns: ReadonlyArray<(self: Self) => Self>): Self
}

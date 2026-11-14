/** Ported from `effect-atom-jsx/src/View.ts` `pipeSelf`. */
export const pipeSelf = (self: unknown, fns: ReadonlyArray<(value: any) => any>): unknown =>
  fns.reduce((acc, fn) => fn(acc), self)

export type Pipeable<Self> = {
  pipe(): Self
  pipe(...fns: ReadonlyArray<(self: Self) => Self>): Self
  pipe<A>(ab: (self: Self) => A): A
  pipe<A, B>(ab: (self: Self) => A, bc: (a: A) => B): B
  pipe<A, B, C>(ab: (self: Self) => A, bc: (a: A) => B, cd: (b: B) => C): C
  // Longer chains whose steps change the type, as attachments that supply
  // obligations change a SlotView's: the rest form above keeps one type throughout.
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

/** Ported from `effect-atom-jsx/src/View.ts` `pipeSelf`. */
export const pipeSelf = (self: unknown, fns: ReadonlyArray<(value: any) => any>): unknown =>
  fns.reduce((acc, fn) => fn(acc), self)

/**
 * Typed steps, to twenty as Effect's `pipe`, so a step that changes the type
 * (an attachment that supplies obligations) keeps the change. There is no
 * catch-all for a spread array: when the typed steps refuse a call, TypeScript
 * reports the last overload it tried, and a catch-all would judge every step
 * against the value `pipe` was called on, so an `A11y.conform` would list
 * what the steps before it supplied. A list of Behaviors is one step,
 * `Behavior.attachAll`.
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
  pipe<A, B, C, D, E, F, G, H, I>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
  ): I
  pipe<A, B, C, D, E, F, G, H, I, J>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
  ): J
  pipe<A, B, C, D, E, F, G, H, I, J, K>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
  ): K
  pipe<A, B, C, D, E, F, G, H, I, J, K, L>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
  ): L
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
  ): M
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
  ): N
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
    op: (n: N) => O,
  ): O
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
    op: (n: N) => O,
    pq: (o: O) => P,
  ): P
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
    op: (n: N) => O,
    pq: (o: O) => P,
    qr: (p: P) => Q,
  ): Q
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
    op: (n: N) => O,
    pq: (o: O) => P,
    qr: (p: P) => Q,
    rs: (q: Q) => R,
  ): R
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
    op: (n: N) => O,
    pq: (o: O) => P,
    qr: (p: P) => Q,
    rs: (q: Q) => R,
    st: (r: R) => S,
  ): S
  pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(
    ab: (self: Self) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => E,
    fg: (e: E) => F,
    gh: (f: F) => G,
    hi: (g: G) => H,
    ij: (h: H) => I,
    jk: (i: I) => J,
    kl: (j: J) => K,
    lm: (k: K) => L,
    mn: (l: L) => M,
    no: (m: M) => N,
    op: (n: N) => O,
    pq: (o: O) => P,
    qr: (p: P) => Q,
    rs: (q: Q) => R,
    st: (r: R) => S,
    tu: (s: S) => T,
  ): T
}

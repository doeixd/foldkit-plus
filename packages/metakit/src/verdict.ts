/**
 * Kleene three-valued logic ($K_3$) for every analyzer in MetaKit.
 *
 * Strictly separate from object-level `null` / `Option`: `Unknown` means the
 * analyzer lacks facts (missing environment slice, opaque term, or iteration
 * budget), never that a runtime column holds `NULL`.
 */
import { Data, Option } from 'effect'

/** Which tier established a `True` verdict. */
export type ProofTier = 'concrete' | 'interval' | 'zone' | 'z3'

/** Evidence attached to a `True` verdict from a static checker or prover. */
export interface ProofEvidence {
  readonly _tag: 'Proved'
  readonly tier: ProofTier
}

export const Proved = (tier: ProofTier): ProofEvidence => ({ _tag: 'Proved', tier })

/** A remaining verification goal handed off when a lower tier returns `Unknown`. */
export interface Obligation {
  readonly kind: 'missing-env' | 'opaque' | 'nonlinear' | 'budget' | 'unsupported'
  readonly detail: string
}

export type Verdict<W = unknown> = Data.TaggedEnum<{
  readonly True: { readonly evidence: Option.Option<ProofEvidence> }
  readonly False: { readonly witness: Option.Option<W> }
  readonly Unknown: {
    readonly reason: string
    readonly obligation: Option.Option<Obligation>
  }
}>

interface VerdictDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Verdict<this['A']>
}

const Constructors = Data.taggedEnum<VerdictDefinition>()

export const True = <W = never>(
  evidence: Option.Option<ProofEvidence> = Option.none(),
): Verdict<W> => Constructors.True<W>({ evidence })

export const False = <W = unknown>(witness: Option.Option<W> = Option.none()): Verdict<W> =>
  Constructors.False<W>({ witness })

export const Unknown = <W = never>(
  reason: string,
  obligation: Option.Option<Obligation> = Option.none(),
): Verdict<W> => Constructors.Unknown<W>({ reason, obligation })

export const isTrue = <W>(
  verdict: Verdict<W>,
): verdict is Extract<Verdict<W>, { readonly _tag: 'True' }> => Constructors.$is('True')(verdict)

export const isFalse = <W>(
  verdict: Verdict<W>,
): verdict is Extract<Verdict<W>, { readonly _tag: 'False' }> => Constructors.$is('False')(verdict)

export const isUnknown = <W>(
  verdict: Verdict<W>,
): verdict is Extract<Verdict<W>, { readonly _tag: 'Unknown' }> =>
  Constructors.$is('Unknown')(verdict)

export const match = <W, A>(
  verdict: Verdict<W>,
  cases: {
    readonly True: (v: Extract<Verdict<W>, { readonly _tag: 'True' }>) => A
    readonly False: (v: Extract<Verdict<W>, { readonly _tag: 'False' }>) => A
    readonly Unknown: (v: Extract<Verdict<W>, { readonly _tag: 'Unknown' }>) => A
  },
): A => Constructors.$match(verdict, cases) as A

/** Kleene $K_3$ negation: `not(Unknown) = Unknown`. */
export const not = <W>(verdict: Verdict<W>): Verdict<W> =>
  match<W, Verdict<W>>(verdict, {
    True: () => False<W>(),
    False: () => True<W>(),
    Unknown: u => u,
  })

/** Kleene $K_3$ conjunction: `False && Unknown = False`. */
export const and = <W>(left: Verdict<W>, right: Verdict<W>): Verdict<W> =>
  match<W, Verdict<W>>(left, {
    False: f => f,
    True: () => right,
    Unknown: u =>
      match<W, Verdict<W>>(right, {
        False: f => f,
        True: () => u,
        Unknown: () => u,
      }),
  })

/** Kleene $K_3$ disjunction: `True || Unknown = True`. */
export const or = <W>(left: Verdict<W>, right: Verdict<W>): Verdict<W> =>
  match<W, Verdict<W>>(left, {
    True: t => t,
    False: () => right,
    Unknown: u =>
      match<W, Verdict<W>>(right, {
        True: t => t,
        False: () => u,
        Unknown: () => u,
      }),
  })

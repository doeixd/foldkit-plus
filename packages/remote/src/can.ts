/**
 * `Data.can` (#533): whether a declared write would be refused, told from what
 * the client holds, in the order the server refuses: a held `may`, then the
 * write's `when`, then the invariants of the row it leaves.
 */
import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { Verdict } from 'metakit'

/** What the client can tell the server would refuse a write with. */
export const CanRefusal = defineTaggedUnion({
  /** A held `may` forbids it, with its words when it gave any. */
  Forbidden: { reason: Schema.Option(Schema.String) },
  /** The row does not hold what the write's `when` asks. */
  Unmet: {},
  /** The row the write would leave breaks this invariant of its Entity. */
  Invalid: {
    entity: Schema.String,
    rule: Schema.String,
    message: Schema.String,
    path: Schema.Array(Schema.String),
  },
})
export type CanRefusal = typeof CanRefusal.Type

/**
 * `Can` as JSON: the shape that crosses a wire, and the one `Can.fromWire`
 * and `Can.toWire` convert to and from, since a `Verdict` holds `Option`
 * values and is not JSON.
 */
export const CanWire = defineTaggedUnion({
  Yes: {},
  No: { refusal: CanRefusal },
  Undecided: { reasons: Schema.Array(Schema.String) },
})
export type CanWire = typeof CanWire.Type

/**
 * What `Data.can` answers, as a metakit `Verdict` read with `Verdict.match`:
 * `True` the write would not be refused; `False` with the `CanRefusal` as its
 * witness, a hint the server would refuse, not a refusal (the write is still
 * sent when it is made); `Unknown` says why the client cannot tell (the row is
 * not held, a field or operator is missing, or an input key was not given),
 * its reasons joined by `'; '`.
 */
export type Can = Verdict.Verdict<CanRefusal>

const reasonSeparator = '; '

const undecided = (reasons: ReadonlyArray<string>): Can =>
  Verdict.Unknown(reasons.join(reasonSeparator))

export const Can = {
  /** The client cannot tell, for these reasons. */
  undecided,

  /** The `Can` a wire value says. */
  fromWire: (wire: CanWire): Can =>
    CanWire.match(wire, {
      Yes: () => Verdict.True(),
      No: ({ refusal }) => Verdict.False(Option.some(refusal)),
      Undecided: ({ reasons }) => undecided(reasons),
    }),

  /**
   * The wire value of a `Can`. Throws for a `False` with no refusal, which
   * `Data.can` never answers: a `No` on the wire names its refusal.
   */
  toWire: (can: Can): CanWire =>
    Verdict.match<CanRefusal, CanWire>(can, {
      True: () => CanWire.Yes({}),
      False: ({ witness }) =>
        Option.match(witness, {
          onNone: () => {
            throw new Error('[foldkit-remote] a refusal with no CanRefusal has no wire value')
          },
          onSome: refusal => CanWire.No({ refusal }),
        }),
      Unknown: ({ reason }) =>
        CanWire.Undecided({ reasons: reason === '' ? [] : reason.split(reasonSeparator) }),
    }),
}

/** What `Data.capability`'s hooks are asked: an agent capability's call, as `foldkit-agent` passes it. */
export interface CapabilityRequest<AppModel, Input, Principal = unknown> {
  readonly model: AppModel
  readonly input: Input
  readonly principal: Principal
}

/**
 * An agent capability's `authorize` and `applies`, from `Data.can` over the
 * write it dispatches. Plain functions in the shape `foldkit-agent` reads, so
 * Remote depends on no agent package.
 */
export interface CapabilityChecks<AppModel, Input, Principal = unknown> {
  /** Refuses where a held `may` forbids the write, with its words when it gave any. */
  readonly authorize: (
    request: CapabilityRequest<AppModel, Input, Principal>,
  ) => boolean | { readonly allowed: false; readonly reason: string }
  /** Refuses where the write's `when` does not hold, or the row it leaves breaks an invariant. */
  readonly applies: (
    request: CapabilityRequest<AppModel, Input, Principal>,
  ) => boolean | { readonly applies: false; readonly reason: string }
}

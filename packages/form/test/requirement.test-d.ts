/**
 * A check that needs something makes the form need it. Effect's `R` is not an
 * inference site a mapped type can win, so `Form.checks` reads the requirement
 * off the functions it is given; this is the test that it is not quietly `never`.
 */
import { Context, Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from '../src/index.js'

class Svc extends Context.Service<Svc, { readonly go: () => void }>()('Svc') {}

const P = Entity.define('P', Schema.Struct({ id: Schema.String, slug: Schema.String }))
const I = Schema.Struct({ slug: Schema.String })

const needsSvc = (_slug: string): Effect.Effect<string | undefined, never, Svc> =>
  Effect.gen(function* () {
    yield* Svc
    return undefined
  })

const Plain = Form.make('Plain', Entity.input(P, I), {})
const Asking = Plain.pipe(Form.checks({ slug: needsSvc }))

type Requirement<F> = F extends { readonly types: { readonly R: infer R } } ? R : never
type Expect<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

// The form that asks needs the service; the form that does not, does not.
const _asking: Expect<Requirement<typeof Asking>, Svc> = true
const _plain: Expect<Requirement<typeof Plain>, never> = true

// A check whose key is not the form's is still refused.
// @ts-expect-error - "nope" is not a key of this form
Plain.pipe(Form.checks({ nope: needsSvc }))

// A check given the wrong value type is still refused.
// @ts-expect-error - slug is a string, not a number
Plain.pipe(Form.checks({ slug: (_n: number) => Effect.succeed(undefined) }))

export { _asking, _plain }

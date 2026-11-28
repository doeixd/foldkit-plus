import { Transition } from '@doeixd/metakit'

declare const refused: Transition.Refused

const cases = {
  Input: () => 'input',
  Supplied: () => 'supplied',
  UnknownMessage: ({ tag }: { readonly tag: string }) => tag,
  Guard: ({ answer }: { readonly answer: false | null }) => String(answer),
  GuardRefused: () => 'guard refused',
  Evaluation: () => 'evaluation refused',
}

Transition.Why.$match(refused.why, {
  ...cases,
  Unwritable: ({ target, detail }) => `${target.join('.')}: ${detail}`,
})

// @ts-expect-error A matcher must handle Unwritable too.
Transition.Why.$match(refused.why, cases)

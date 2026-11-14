/**
 * `applies`, broken in turn: `pnpm mutate packages/agent/test/applies.mutations.ts`.
 */
const runtime = '../src/runtime.ts'
const tests = ['packages/agent/test/applies.test.ts']

/** The check as it stands after `authorize`, moved or rewritten by the mutations below. */
const check = `      if (variant.applies !== undefined) {
        const applies = variant.applies({ principal, input: decoded, model })
        if (applies !== true) {
          return yield* CapabilityUnavailableError.of(
            name,
            variant.tag,
            applies === false ? undefined : applies.reason,
          )
        }
      }`

export default [
  {
    name: 'applies runs before authorize',
    edits: [
      { file: runtime, find: check, replace: '' },
      {
        file: runtime,
        find: '      if (variant.authorize !== undefined) {',
        replace: `${check}\n      if (variant.authorize !== undefined) {`,
      },
    ],
    tests,
  },
  {
    name: 'a refusal with a reason is taken as applying',
    edits: [{ file: runtime, find: 'if (applies !== true) {', replace: 'if (!applies) {' }],
    tests,
  },
  {
    name: 'a refusal drops its reason',
    edits: [
      {
        file: runtime,
        find: 'applies === false ? undefined : applies.reason,',
        replace: 'undefined,',
      },
    ],
    tests,
  },
  {
    name: 'applies reads the live Model, not the snapshot',
    edits: [
      {
        file: runtime,
        find: 'variant.applies({ principal, input: decoded, model })',
        replace: 'variant.applies({ principal, input: decoded, model: host.model() })',
      },
    ],
    tests,
  },
  {
    name: 'applies is never asked',
    edits: [
      { file: runtime, find: 'if (variant.applies !== undefined) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'a capability with applies is not described as input-dependent',
    edits: [
      {
        file: '../src/introspect.ts',
        find: 'inputDependent: variant.applies !== undefined,',
        replace: 'inputDependent: false,',
      },
    ],
    tests,
  },
]

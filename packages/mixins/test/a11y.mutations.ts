/**
 * Accessibility obligations, broken in turn: `pnpm mutate packages/mixins/test/a11y.mutations.ts`.
 */
const tests = ['packages/mixins/test/a11y.test.ts']

export default [
  {
    name: 'a support list is not read',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'if (support !== undefined && requirement.obligations !== undefined)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'two arguments start requiring providers',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'if (support !== undefined && requirement.obligations !== undefined)',
        replace: 'if (requirement.obligations !== undefined)',
      },
    ],
    tests,
  },
  {
    name: 'an empty provider still satisfies',
    edits: [
      {
        file: '../src/a11y.ts',
        find: "item.slot === slot && item.obligation === obligation && item.provider !== ''",
        replace: 'item.slot === slot && item.obligation === obligation',
      },
    ],
    tests,
  },
  {
    name: 'an unnamed delegate is only unsatisfied',
    edits: [
      {
        file: '../src/a11y.ts',
        find: "if (unnamed !== undefined && unnamed.provider === '')",
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'an empty provider is accepted',
    edits: [
      {
        file: '../src/a11y.ts',
        find: "if (provider === '') throw new Error(`A ${kind} obligation names its provider`)",
        replace:
          "if (provider === 'skip') throw new Error(`A ${kind} obligation names its provider`)",
      },
    ],
    tests,
  },
  {
    name: 'an unknown pattern obligation is kept',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'for (const obligation of obligations) {\n        if (!isObligation(obligation)) throw new Error(`Unknown obligation: ${obligation}`)\n      }',
        replace: 'for (const obligation of obligations) {\n        void obligation\n      }',
      },
    ],
    tests,
  },
  {
    name: 'an unknown behavior supply is kept',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'for (const obligation of supplies) {\n      if (!isObligation(obligation)) throw new Error(`Unknown obligation: ${obligation}`)',
        replace:
          'for (const obligation of supplies) {\n      if (false) throw new Error(`Unknown obligation: ${obligation}`)',
      },
    ],
    tests,
  },
  {
    name: 'an absent optional slot is still required',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'if (requirement.optional === true) continue',
        replace:
          'if (requirement.optional === true && requirement.obligations === undefined) continue',
      },
    ],
    tests,
  },
  {
    name: 'a hidden slot is obligation-checked too',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'if (slot.hidden)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'bound does not judge the support list',
    edits: [
      {
        file: '../src/a11y.ts',
        find: 'validate(pattern, slots, support as readonly ObligationSupport[])',
        replace: 'validate(pattern, slots)',
      },
    ],
    tests,
  },
  {
    name: 'forSlots keeps an unknown supply',
    edits: [
      {
        file: '../src/behavior.ts',
        find: 'const unknown = slotOptions?.supplies?.find(name => !isObligation(name))\n      if (unknown !== undefined) throw new Error(`Unknown obligation: ${unknown}`)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'checked state declares nothing',
    edits: [
      {
        file: '../src/behaviors/toggle-state.ts',
        find: "...(options.as === 'checked' ? { supplies: ['checked'] as const } : {}),\n",
        replace: '',
      },
    ],
    tests,
  },
]

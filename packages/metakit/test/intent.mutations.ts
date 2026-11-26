export default [
  {
    name: 'canDispatch ignores the host-supplied facts',
    edits: [
      {
        file: '../src/can.ts',
        find: 'onSome: transition => can(transition, partial, options),',
        replace:
          'onSome: transition => can(transition, { state: partial.state, input: partial.input }, options),',
      },
    ],
    tests: ['packages/metakit/test/integrations.test.ts'],
  },
]

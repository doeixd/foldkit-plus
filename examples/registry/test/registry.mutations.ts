/**
 * The registry's retired edits and replacements, each broken in turn: `pnpm mutate examples/registry/test/registry.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'a newly retired edit asks for no read',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'retiresAny(previous, retired) ? Products.refresh(kept) : kept',
        replace: 'kept',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
  {
    name: 'the device is never named',
    edits: [
      {
        file: '../src/sync.ts',
        find: '  mounted.dispatch(Message.DeviceNamed({ device: options.device }))\n',
        replace: '',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
  {
    name: 'a read says nothing replaced',
    edits: [
      {
        file: '../src/app.ts',
        find: '                mine(kept) && kept.value !== shown',
        replace: '                false && mine(kept) && kept.value !== shown',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
  {
    name: "a read reports another device's edit as replaced",
    edits: [
      {
        file: '../src/app.ts',
        find: '                mine(kept) && kept.value !== shown',
        replace: '                kept.value !== shown',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
  {
    name: 'a read lets go of an edit it has not reached',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Option.filter(field, kept => Option.exists(kept.at, at => reached(at, row.revision))),',
        replace: 'Option.filter(field, kept => Option.isSome(kept.at)),',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
  {
    name: 'no transition settles the retired edits',
    edits: [
      {
        file: '../src/app.ts',
        find: '  const settled = settledOf(next.model)',
        replace: '  const settled = next.model',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
  {
    name: 'nothing is retired',
    edits: [
      {
        file: '../src/app.ts',
        find: '  heldOf([...previous.retired, ...previous.edits], next)',
        replace: '  heldOf([], next)',
      },
    ],
    tests: ['examples/registry/test/page.test.ts'],
  },
]

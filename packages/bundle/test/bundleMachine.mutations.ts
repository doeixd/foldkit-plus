/**
 * `Bundle.make({ machine })` and placement `Machine.lift`, broken in turn:
 * `pnpm mutate packages/bundle/test/bundleMachine.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/bundle/test/bundleMachine.test.ts']

export default [
  {
    name: 'Bundle.make drops machine exposure',
    edits: [
      {
        file: '../src/bundle.ts',
        find: '  const { machine, ...rest } = spec\n  const bundle = {\n    ...rest,\n    ...(machine === undefined ? {} : { machine }),',
        replace: '  const { machine, ...rest } = spec\n  const bundle = {\n    ...rest,',
      },
    ],
    tests,
  },
  {
    name: 'Bundle.with drops machine exposure',
    edits: [
      {
        file: '../src/bundle.ts',
        find: '        // A preset has its args, so helpers that read them become a record.\n        ...(spec.helpers === undefined ? {} : { helpers: helpersFor(spec.helpers, args) }),\n        ...(machine === undefined ? {} : { machine }),',
        replace:
          '        // A preset has its args, so helpers that read them become a record.\n        ...(spec.helpers === undefined ? {} : { helpers: helpersFor(spec.helpers, args) }),',
      },
    ],
    tests,
  },
  {
    name: 'placement drops Machine.lift',
    edits: [
      {
        file: '../src/placed.ts',
        find: '    ...(bundle.machine === undefined\n      ? {}\n      : {\n          machine: (\n            bundle.machine as unknown as {\n              readonly [MACHINE_LIFT]: (segments: ReadonlyArray<string>) => unknown\n            }\n          )[MACHINE_LIFT](link.path),\n        }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'placement lifts at root instead of link.path',
    edits: [
      {
        file: '../src/placed.ts',
        find: '          )[MACHINE_LIFT](link.path),',
        replace: '          )[MACHINE_LIFT]([]),',
      },
    ],
    tests,
  },
]

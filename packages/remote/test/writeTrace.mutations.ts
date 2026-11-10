/**
 * #477's fix, broken: a list with no body kept on a change to another Entity,
 * as before; and #489's reason why a list went stale, each piece dropped.
 * `pnpm mutate packages/remote/test/writeTrace.mutations.ts`.
 */
export default [
  {
    name: 'a list with no body is kept when another Entity changes',
    edits: [
      {
        file: '../src/impact.ts',
        find: '  if (body === undefined) {\n    return Impact.Invalidated',
        replace:
          '  if (body === undefined && (descriptor.Result as { readonly entity?: string }).entity !== change.entity) return kept\n  if (body === undefined) {\n    return Impact.Invalidated',
      },
    ],
    tests: ['packages/remote/test/writeTrace.test.ts', 'packages/remote/test/impact.test.ts'],
  },
  ...(
    [
      ['the reducer keeps no reason', '../src/model.ts', '            [connection]: because,', ''],
      [
        'a list stale again takes the newer reason',
        '../src/model.ts',
        '      connections === model.connections',
        '      false',
      ],
      [
        'a Model encoded before staleBecause refuses to decode',
        '../src/model.ts',
        '    staleBecause: addedRecord,',
        '    staleBecause: Schema.Unknown,',
      ],
      [
        'a Model encoded before echoes refuses to decode',
        '../src/model.ts',
        '    echoes: addedRecord,',
        '    echoes: Schema.Unknown,',
      ],
      [
        'a collected list keeps its reason',
        '../src/model.ts',
        'staleBecause: keptByList(model.staleBecause, retained.connections),',
        '',
      ],
      [
        'why leaves the reason out of a stale list',
        '../src/whyReasons.ts',
        "reasons.push(Why.List({ list, held: 'Stale', inFlight }), ...invalidated)",
        "reasons.push(Why.List({ list, held: 'Stale', inFlight }))",
      ],
      [
        'why leaves the reason out of a missing list',
        '../src/whyReasons.ts',
        'Why.List({ list, held, inFlight }), ...invalidated]',
        'Why.List({ list, held, inFlight })]',
      ],
      [
        "an answer drops impactOn's reason",
        '../src/bodies.ts',
        'Invalidated: ({ reason }) => Result.fail(reason),',
        "Invalidated: () => Result.fail('stale'),",
      ],
    ] as const
  ).map(([name, file, find, replace]) => ({
    name,
    edits: [{ file, find, replace }],
    tests: [
      'packages/remote/test/writeTrace.test.ts',
      'packages/remote/test/whyReasons.test.ts',
      'packages/remote/test/liveBelongs.test.ts',
      'packages/remote/test/domain.test.ts',
    ],
  })),
]

/**
 * `Scenario` (#538), broken in turn:
 * `pnpm mutate packages/remote/test/scenario.mutations.ts`.
 *
 * `examples/writes/test/scenarios.test.ts` runs the same scenarios through the
 * example's SQLite server, so the runner's own mutations are killed there.
 */
const scenario = '../src/scenario.ts'
const tests = [
  'packages/remote/test/scenario.test.ts',
  'examples/writes/test/scenarios.test.ts',
  'packages/sync/test/scenarios.test.ts',
]

export default [
  {
    name: 'the report check is skipped',
    edits: [
      {
        file: scenario,
        find: 'if (options.report !== undefined) checkAgainst(scenario, options.report)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'refused matches any refusal',
    edits: [
      {
        file: scenario,
        find: 'const same = (left: unknown, right: unknown): boolean =>\n  stableStringify(left) === stableStringify(right)',
        replace:
          'const same = (left: unknown, right: unknown): boolean =>\n  stableStringify(left) === stableStringify(right) ||\n  (JSON.stringify(left).includes(\'"Refused"\') && JSON.stringify(right).includes(\'"Refused"\'))',
      },
    ],
    tests,
  },
  {
    name: 'the backend is not seeded from given',
    edits: [
      {
        file: scenario,
        find: 'options.backend(scenario.given, scenario.principal)',
        replace: 'options.backend([], scenario.principal)',
        all: true,
      },
    ],
    tests,
  },
  {
    name: 'a runner with a mismatch is issued evidence',
    edits: [
      {
        file: scenario,
        find: '          !wrong.some(({ backend }) => backend === runner.name),',
        replace: '          true,',
      },
    ],
    tests,
  },
  {
    name: 'a refusal scenario is issued evidence',
    edits: [
      {
        file: scenario,
        find: "options.report === undefined || scenario.expect._tag !== 'Accepted'",
        replace: 'options.report === undefined',
      },
    ],
    tests,
  },
  {
    name: 'evidence names every law of the write, not the ones it could break',
    edits: [
      {
        file: scenario,
        find: '        Derived: ({ writes }) => pair.reads.some(key => writes.includes(key)),',
        replace: '        Derived: () => true,',
      },
    ],
    tests,
  },
  {
    name: 'a runner that checked nothing is issued evidence',
    edits: [
      {
        file: scenario,
        find: '          steps.some(({ backend }) => backend === runner.name) &&\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a landing is refused wherever the report refused the write, from any row',
    edits: [
      {
        file: scenario,
        find: 'each => agreesOn(row, each.before) && agreesOn(encoded, each.input),',
        replace: 'each => agreesOn(encoded, each.input),',
      },
    ],
    tests,
  },
  {
    name: 'a refusal by a kept invariant passes the report',
    edits: [
      {
        file: scenario,
        find: "if (by === 'disjointness' || by === 'enumeration')",
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'fromReport takes the first start whatever its state',
    edits: [
      {
        file: scenario,
        find: 'if (!Option.contains(Entity.inState(from, start.row), true)) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'fromReport takes the first start for a refused pair',
    edits: [
      {
        file: scenario,
        find: 'if (agreesOn(start.row, step.before))',
        replace: 'if (true)',
      },
    ],
    tests,
  },
  {
    name: 'a refused pair is expected to be refused as unmet',
    edits: [
      {
        file: scenario,
        find: "{ _tag: 'Refused', refusal: { entity: pair.entity, id: pair.invariant } },",
        replace: "{ _tag: 'Refused', refusal: 'Unmet' },",
      },
    ],
    tests,
  },
  {
    name: 'a Message scenario does not judge the law on a reading',
    edits: [
      {
        file: scenario,
        find: "      { backend, step: 'law', expected: 'none', actual: brokenLaw },\n    ],\n    Breaks",
        replace: '    ],\n    Breaks',
      },
    ],
    tests,
  },
  {
    name: 'a Message scenario reads a reader off the prototype',
    edits: [
      {
        file: scenario,
        find: 'Object.hasOwn(readers, name) ? readers[name] : undefined',
        replace: 'readers[name]',
      },
    ],
    tests,
  },
  {
    name: 'the Message history is not applied',
    edits: [
      {
        file: scenario,
        find: 'const history = scenario.given.reduce(',
        replace: 'const history = [].reduce(',
      },
    ],
    tests,
  },
]

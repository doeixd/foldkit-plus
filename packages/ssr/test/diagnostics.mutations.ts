/**
 * What SSR reports, broken in turn:
 * `pnpm mutate packages/ssr/test/diagnostics.mutations.ts`.
 */
const client = '../src/client.ts'
const server = '../src/index.ts'
const shared = '../src/shared.ts'
const diagnostics = '../src/diagnostics.ts'

const refusals = [
  'packages/ssr/test/tampered.test.ts',
  'packages/ssr/test/routeRefused.test.ts',
  'packages/ssr/test/routeQuery.test.ts',
  'packages/ssr/test/generatedRefused.test.ts',
]
const entry = ['packages/ssr/test/entry.test.ts', 'packages/ssr/test/fallback.test.ts']
const unnamed = ['packages/ssr/test/unnamed.test.ts']

export default [
  {
    name: 'a page given no build id is contained in silence',
    edits: [{ file: client, find: '    report(noBuildId)', replace: '' }],
    tests: ['packages/ssr/test/noBuildId.test.ts'],
  },
  {
    name: 'a page whose state cannot resume is contained in silence',
    edits: [
      {
        file: client,
        find: '    report(pageContained(resumed.failure.reason, resumed.failure.message))',
        replace: '',
      },
    ],
    tests: refusals,
  },
  {
    name: 'a refusal is reported with the wrong reason',
    edits: [
      {
        file: client,
        find: 'report(pageContained(resumed.failure.reason, resumed.failure.message))',
        replace: "report(pageContained('Missing', resumed.failure.message))",
      },
    ],
    tests: refusals,
  },
  {
    name: 'a page whose bindings cannot be read is contained in silence',
    edits: [
      {
        file: client,
        find: '    report(pageContained(decoded.failure.reason, decoded.failure.message))',
        replace: '',
      },
    ],
    tests: ['packages/ssr/test/bindingsRefused.test.ts'],
  },
  {
    name: 'hydrate ignores the reporter it is given',
    edits: [
      {
        file: client,
        find: 'reportingTo(options.diagnostics)(Diagnostics.report(diagnostic))',
        replace: 'reportingTo(undefined)(Diagnostics.report(diagnostic))',
      },
    ],
    tests: ['packages/ssr/test/noBuildId.test.ts', 'packages/ssr/test/staticMissing.test.ts'],
  },
  {
    name: 'a bundle that did not load is not reported',
    edits: [{ file: client, find: '      report(bundleUnloaded(error))', replace: '' }],
    tests: ['packages/ssr/test/lazyUnloaded.test.ts'],
  },
  {
    name: 'a missing static region is not reported',
    edits: [{ file: shared, find: '      now.report(staticRegionMissing(id))', replace: '' }],
    tests: ['packages/ssr/test/staticMissing.test.ts'],
  },
  {
    name: 'a missing static region is reported on every render',
    edits: [{ file: shared, find: '      now.reported.add(id)', replace: '' }],
    tests: ['packages/ssr/test/staticMissing.test.ts'],
  },
  {
    name: '`headers` that throw are answered 500 in silence',
    edits: [
      {
        file: server,
        find: 'reporting(Diagnostics.report(pageFailed(request.url, Cause.die(error)))),',
        replace: 'Effect.void,',
      },
    ],
    tests: entry,
  },
  {
    name: 'a failed render is answered 500 in silence',
    edits: [
      {
        file: server,
        find: '      await Effect.runPromise(reporting(Diagnostics.report(pageFailed(request.url, exit.cause))))',
        replace: '',
      },
    ],
    tests: entry,
  },
  {
    name: 'the entry ignores its own reporter',
    edits: [
      {
        file: server,
        find: 'diagnostics === undefined ? undefined : diagnostic => diagnostics(diagnostic, request),',
        replace: 'undefined,',
      },
    ],
    tests: [...entry, ...unnamed],
  },
  {
    name: "a posted form's Commands report past the entry's reporter",
    edits: [{ file: server, find: '      }).pipe(reporting),', replace: '      }),' }],
    tests: ['packages/ssr/test/fallback.test.ts'],
  },
  {
    name: 'an unnamed handler is reported on every request',
    edits: [
      { file: server, find: '      if (reportedUnnamed.has(key)) return false', replace: '' },
    ],
    tests: unnamed,
  },
  {
    name: 'an unnamed handler is reported for a page that boots at once',
    edits: [
      {
        file: server,
        find: "    if (plan.start === 'now' && (config.lazy ?? []).length === 0) return Effect.void",
        replace: '',
      },
    ],
    tests: unnamed,
  },
  {
    name: 'the generator does not report unnamed handlers',
    edits: [
      {
        file: server,
        find: '        Effect.tap(result => reportUnnamed(config, plan, result.unnamed)),',
        replace: '',
      },
    ],
    tests: unnamed,
  },
  {
    name: 'a contained page is only a warning',
    edits: [
      {
        file: diagnostics,
        find: "  _tag: 'PageContained',\n  source,\n  level: 'error',",
        replace: "  _tag: 'PageContained',\n  source,\n  level: 'warning',",
      },
    ],
    tests: ['packages/ssr/test/noBuildId.test.ts'],
  },
  {
    name: 'an unnamed handler is an error',
    edits: [
      {
        file: diagnostics,
        find: "  _tag: 'HandlerUnnamed',\n  source,\n  level: 'warning',",
        replace: "  _tag: 'HandlerUnnamed',\n  source,\n  level: 'error',",
      },
    ],
    tests: unnamed,
  },
]

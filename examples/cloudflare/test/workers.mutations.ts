/**
 * The local stack, broken one piece at a time:
 * `pnpm mutate examples/cloudflare/test/workers.mutations.ts`
 */
const workers = 'examples/cloudflare/test/workers.test.ts'
const file = '../src/workers.ts'

export default [
  {
    name: 'a date the installed workerd does not know is run anyway',
    edits: [
      {
        file,
        find: '  checkCompatibilityDate(toml.compatibility_date, supportedCompatibilityDate)\n',
        replace: '',
      },
    ],
    tests: [workers],
  },
  {
    name: 'the date workerd supports is refused',
    edits: [{ file, find: 'if (date > supported)', replace: 'if (date >= supported)' }],
    tests: [workers],
  },
  {
    name: 'a bundle Wrangler would bundle again is accepted',
    edits: [
      { file, find: 'no_bundle: Schema.Literal(true),', replace: 'no_bundle: Schema.Boolean,' },
    ],
    tests: [workers],
  },
  {
    name: 'an [env.*] section is ignored',
    edits: [{ file, find: "if ('env' in raw)", replace: "if ('env' in raw && false)" }],
    tests: [workers],
  },
  {
    name: 'the harness runs what main names, not this bundle',
    edits: [{ file, find: 'config: { ...raw, main: outfile },', replace: 'config: raw,' }],
    tests: [workers],
  },
  {
    name: 'no migrations are applied',
    edits: [
      {
        file,
        find: 'await worker.applyD1Migrations(database.binding)',
        replace: 'void database',
      },
    ],
    tests: [workers],
  },
  {
    name: 'the secrets given are dropped',
    edits: [{ file, find: 'secrets: options.secrets,', replace: '' }],
    tests: ['examples/cloudflare/test/media.test.ts'],
  },
  {
    name: 'the vars given are dropped',
    edits: [{ file, find: 'vars: options.vars,', replace: '' }],
    tests: ['examples/cloudflare/test/auth.test.ts'],
  },
  {
    name: 'a change is reported but not swapped in',
    edits: [{ file, find: 'await harness.update(same => same)', replace: '' }],
    tests: [workers],
  },
  {
    name: 'a Worker that did not start is reported as a build error',
    edits: [
      {
        file,
        find: 'listener.onStopped(errorText(error))',
        replace: 'listener.onBuildError(errorText(error))',
      },
    ],
    tests: [workers],
  },
  {
    name: 'the bindings are read once, before any swap',
    edits: [
      {
        file,
        find: 'const env = () => harness.getWorker<Env>().getEnv()',
        replace:
          'const bindings = await harness.getWorker<Env>().getEnv()\n    const env = () => Promise.resolve(bindings)',
      },
    ],
    tests: [workers],
  },
  {
    name: 'a build after the stack stopped is swapped in anyway',
    edits: [{ file, find: 'if (Option.isNone(running)) return', replace: '' }],
    tests: [workers],
    survives:
      'After a stop, no completed rebuild is observable without a sleep: the harness has no session to swap into, and the test cannot wait for a build that reports nothing.',
  },
]

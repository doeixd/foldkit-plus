/**
 * The local Workers stack, broken one piece at a time:
 * `pnpm mutate packages/plus/test/workers.mutations.ts`
 */
const workers = 'packages/plus/test/workers.test.ts'
const file = '../src/testing/workers.ts'
const peerFile = '../src/testing/peer.ts'

const edit = (name: string, find: string, replace: string, target = file) => ({
  name,
  edits: [{ file: target, find, replace }],
  tests: [workers],
})

export default [
  edit(
    'a date the installed workerd does not know is run anyway',
    'if (config.compatibility_date > supported)',
    'if (false)',
  ),
  edit(
    'the date workerd supports is refused',
    'if (config.compatibility_date > supported)',
    'if (config.compatibility_date >= supported)',
  ),
  edit(
    'a bundle Wrangler would bundle again is accepted',
    'no_bundle: Schema.Literal(true),',
    'no_bundle: Schema.Boolean,',
  ),
  edit('an [env.*] section is ignored', "if ('env' in raw)", "if ('env' in raw && false)"),
  edit(
    'the harness runs what main names, not this bundle',
    'config: { ...raw, main: outfile },',
    'config: raw,',
  ),
  edit(
    'no migrations are applied',
    'await worker.applyD1Migrations(database.binding)',
    'void database',
  ),
  edit('the secrets given are dropped', 'secrets: options.secrets }', '}'),
  edit(
    'the vars given are dropped',
    "harnessOptions(typeof vars === 'function' ? undefined : vars)",
    'harnessOptions(undefined)',
  ),
  edit(
    'vars of the origin are never given',
    "if (typeof vars === 'function') await harness.update(harnessOptions(vars(url.origin)))",
    '',
  ),
  edit('vars are given the URL, not its origin', 'vars(url.origin)', 'vars(url.href)'),
  edit("the Worker's console is read and never cleared", '    harness.clearLogs()\n', ''),
  edit(
    'logs() leaves what it returned to be returned again',
    'return kept.splice(0)',
    'return [...kept]',
  ),
  edit(
    'a quiet stack prints anyway',
    "if (options.console !== 'quiet') fresh.forEach(print)",
    'fresh.forEach(print)',
  ),
  edit(
    'nothing is printed',
    "if (options.console !== 'quiet') fresh.forEach(print)",
    'if (false) fresh.forEach(print)',
  ),
  edit('an error is printed as a log', "['error', line => console.error(line)],", ''),
  edit('a warning is printed as a log', "['warn', line => console.warn(line)],", ''),
  edit(
    'a line is printed without saying it is the Worker',
    '`[worker] ${log.message}`',
    'log.message',
  ),
  edit(
    'what the Worker wrote since the last tick is lost when the stack stops',
    '        drain()\n        await rm(',
    '        await rm(',
  ),
  edit('a change is reported but not swapped in', 'await harness.update(same => same)', ''),
  edit(
    'an entry emptied as it is saved is swapped in, and stops the stack',
    'file.path === outfile && file.contents.length === 0',
    'false',
  ),
  edit(
    'a Worker that did not start is reported as a build error',
    'listener.onStopped(errorText(error))',
    'listener.onBuildError(errorText(error))',
  ),
  edit(
    'the bindings are read once, before any swap',
    'const env = () => harness.getWorker<Env>().getEnv()',
    'const bindings = await harness.getWorker<Env>().getEnv()\n    const env = () => Promise.resolve(bindings)',
  ),
  edit(
    'the deploy bundle goes beside the configuration, not where main says',
    'const outfile = resolve(dirname(options.wrangler), config.main)',
    "const outfile = resolve(dirname(options.wrangler), 'worker.js')",
  ),
  edit(
    'a missing peer is thrown as it came',
    '    if (!isMissing(error, name)) throw error\n',
    '    throw error\n',
    peerFile,
  ),
  edit(
    'any failure to load reads as a missing peer',
    "  'code' in error &&\n  error.code === 'ERR_MODULE_NOT_FOUND' &&\n",
    '',
    peerFile,
  ),
  {
    ...edit(
      'a build after a Worker did not start is swapped in anyway',
      'if (Option.isNone(running) || Option.isSome(stopping)) return',
      'if (Option.isSome(stopping)) return',
    ),
    survives:
      'After a Worker did not start, no completed rebuild is observable without a sleep: the harness has no session to swap into, and the test cannot wait for a build that reports nothing.',
  },
  edit(
    'a rebuild in flight when the stack stops is swapped in',
    'if (Option.isNone(running) || Option.isSome(stopping)) return',
    'if (Option.isNone(running)) return',
  ),
  edit(
    'stop waits on a watch context that never opened',
    'const opened = await watcher.then(Option.some, () => Option.none<BuildContext>())',
    'const opened = Option.some(await watcher)',
  ),
  edit(
    'a failed watch is still taken for watching',
    '        if (Option.contains(watching, watcher)) {\n          watching = Option.none()\n          await dispose(watcher)\n        }\n',
    '',
  ),
  {
    name: 'a harness that throws as it closes leaves the bundle behind',
    edits: [
      {
        file,
        find: '      try {\n        await harness.close()\n      } finally {\n',
        replace: '      {\n        await harness.close()\n      }\n      {\n',
      },
    ],
    tests: ['packages/plus/test/workers.close.test.ts'],
  },
]

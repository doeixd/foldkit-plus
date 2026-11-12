/**
 * The loader and what it asks of the runtime (#472), broken in turn at each
 * step: `pnpm mutate packages/ssr/test/loader.mutations.ts` checks that a test
 * fails for every one.
 */
const loader = '../src/loader.ts'
const client = '../src/client.ts'
const keep = '../src/keep.ts'
const resumable = '../src/resumable.ts'
const index = '../src/index.ts'
const chunk = '../src/runtimeChunk.ts'
const browser = ['packages/ssr/test/loader.browser.test.ts']
const checked = ['packages/ssr/test/keepChecked.test.ts']
const unkept = ['packages/ssr/test/unkeptField.test.ts']
const preload = ['packages/ssr/test/loaderPreload.browser.test.ts']
const built = ['packages/ssr/test/loaderBuild.test.ts']

export default [
  {
    name: 'a held submission is not prevented',
    edits: [
      {
        file: loader,
        find: "    if (event.type === 'submit') event.preventDefault()\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'any element counts as intent',
    edits: [
      { file: loader, find: '    if (pathOf(event).some(marked)) run()', replace: '    run()' },
    ],
    tests: browser,
  },
  {
    name: "a kept field's events are held as well",
    edits: [
      {
        file: loader,
        find: '    if (event.target instanceof Element && event.target.hasAttribute(KEEP_ATTRIBUTE)) return\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a held event is released at once',
    edits: [{ file: loader, find: '      }, UNTIL_LIMIT_MS),', replace: '      }, 0),' }],
    tests: browser,
  },
  {
    name: 'a held submission is dropped at the deadline',
    edits: [
      {
        file: loader,
        find: '        held.splice(at, 1)\n        releaseEach(entry)\n',
        replace: '        held.splice(at, 1)\n',
      },
    ],
    tests: browser,
  },
  {
    name: 'the loader keeps holding after a failed chunk',
    edits: [
      {
        file: loader,
        find: '  const releaseAll = (): void => {\n    stop()\n',
        replace: '  const releaseAll = (): void => {\n',
      },
    ],
    tests: browser,
  },
  {
    name: 'a failed chunk releases nothing',
    edits: [
      {
        file: loader,
        find: '    options.runtime().catch(releaseAll)',
        replace: '    options.runtime().catch(() => {})',
      },
    ],
    tests: browser,
  },
  {
    name: 'the held events are not answered',
    edits: [
      {
        file: client,
        find: '  for (const { event, path } of loaded) answer(event, path)\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: "a chunk the loader ran waits for the plan's start again",
    edits: [
      {
        file: client,
        find: "Option.isSome(arrived) || Option.isSome(loader) ? 'now'",
        replace: "Option.isSome(arrived) ? 'now'",
      },
    ],
    tests: browser,
  },
  {
    name: 'an eager page boots past what the loader held',
    edits: [
      { file: client, find: 'if (eager && Option.isNone(loader) && ', replace: 'if (eager && ' },
    ],
    tests: browser,
  },
  {
    name: 'a page from another build keeps what was held',
    edits: [
      {
        file: client,
        find: '    report(otherBuild(Option.fromNullOr(served), options.buildId))\n    release()\n',
        replace: '    report(otherBuild(Option.fromNullOr(served), options.buildId))\n',
      },
    ],
    tests: browser,
  },
  {
    name: 'the envelope does not say when the page starts',
    edits: [
      {
        file: index,
        find: "    ...(resume.start === 'now' ? {} : { start: resume.start }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a deferred plan serves a named field without KeepTyped',
    edits: [
      {
        file: index,
        find: "    if (plan.start !== 'now' && unkept.length > 0) {",
        replace: '    if (false) {',
      },
    ],
    tests: unkept,
  },
  {
    name: 'an unkept field is not recorded',
    edits: [{ file: resumable, find: '      now.unkept.push(element)\n', replace: '' }],
    tests: unkept,
  },
  {
    name: 'a checkbox may not replay its click',
    edits: [{ file: resumable, find: " ?? named.get('OnClick'))", replace: ')' }],
    tests: checked,
  },
  {
    name: 'a ticked box reads as unchanged',
    edits: [
      {
        file: keep,
        find: '  if (isCheckable(element)) return element.checked !== element.defaultChecked\n',
        replace: '',
      },
    ],
    tests: checked,
  },
  {
    name: 'a radio the person left replays too',
    edits: [
      {
        file: keep,
        find: 'const sentChange = (field: KeptField): boolean =>\n',
        replace: 'const sentChange = (_field: KeptField): boolean => true || ',
      },
    ],
    tests: checked,
  },
  {
    name: 'a ticked box is not put back',
    edits: [{ file: keep, find: '      element.checked = checked\n', replace: '' }],
    tests: checked,
    survives:
      'the replayed Message moves the Model to what the person ticked, so the render after it ticks the box anyway; the restore only spares a frame showing the served state',
  },
  {
    name: 'the runtime chunk is not named in the loader',
    edits: [
      {
        file: chunk,
        find: '      if (reference === undefined || !PLACEHOLDER.test(code)) return null',
        replace: '      return null',
      },
    ],
    tests: built,
  },
  {
    name: 'the chunk is fetched when idle, not as the loader starts',
    edits: [
      {
        file: loader,
        find: '  const fetched = fetchChunk()\n',
        replace:
          '  let fetched: Promise<void> = Promise.resolve()\n  whenIdle(() => void (fetched = fetchChunk()))\n',
      },
    ],
    tests: preload,
  },
  {
    name: 'the chunk is never fetched ahead of its run',
    edits: [
      {
        file: loader,
        find: '  const fetched = fetchChunk()\n',
        replace: '  const fetched = Promise.resolve()\n',
      },
    ],
    tests: preload,
  },
]

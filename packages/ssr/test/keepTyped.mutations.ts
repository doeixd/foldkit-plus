/**
 * Keeping what is typed before the runtime starts (#356), broken in turn at
 * each step: `pnpm mutate packages/ssr/test/keepTyped.mutations.ts` checks
 * that a test fails for every one.
 */
const client = '../src/client.ts'
const keep = '../src/keep.ts'
const resumable = '../src/resumable.ts'
const index = '../src/index.ts'
const eager = ['packages/ssr/test/keepTyped.test.ts']
const deferred = ['packages/ssr/test/keepTypedDeferred.test.ts']
const lazy = ['packages/ssr/test/keepTypedLazy.test.ts']
const fields = ['packages/ssr/test/keepFields.test.ts']
const refused = ['packages/ssr/test/keepTypedRefused.test.ts']

export default [
  {
    name: 'the early typing is not queued',
    edits: [
      {
        file: client,
        find: '  answered.push(...typedMessages(kept.success))\n',
        replace: '',
      },
    ],
    tests: [...eager, ...deferred, ...lazy],
  },
  {
    name: 'an eager page with kept fields boots before reading them',
    edits: [
      {
        file: client,
        find: '  if (eager && root.querySelector(`[${KEEP_ATTRIBUTE}]`) === null) {',
        replace: '  if (eager) {',
      },
    ],
    tests: eager,
  },
  {
    name: 'an eager page with typing boots without handing the queue over',
    edits: [
      { file: client, find: '  if (eager && answered.length === 0) {', replace: '  if (eager) {' },
    ],
    tests: eager,
  },
  {
    name: 'the fields are not put back after the first render',
    edits: [{ file: client, find: '    restore(held)\n', replace: '' }],
    tests: [...eager, ...deferred, ...lazy],
  },
  {
    name: 'the fields are held as they were at hydrate, not at boot',
    edits: [{ file: client, find: '    held = hold(kept)\n', replace: '' }],
    tests: [...eager, ...deferred, ...lazy],
  },
  {
    name: 'the selection is not put back',
    edits: [{ file: keep, find: '      element.setSelectionRange(...selection)\n', replace: '' }],
    tests: [...eager, ...deferred, ...lazy],
  },
  {
    name: 'an unchanged field is replayed too',
    edits: [
      {
        file: keep,
        find: '  field.element.value !== servedValue(field.element)',
        replace: '  true',
      },
    ],
    tests: [...eager, ...fields],
  },
  {
    name: "a select's default is its first option",
    edits: [
      {
        file: keep,
        find: '    options.filter(option => option.defaultSelected).at(-1) ??\n',
        replace: '',
      },
    ],
    tests: [...deferred, ...fields],
  },
  {
    name: "a select's default is its first selected option",
    edits: [
      {
        file: keep,
        find: '    options.filter(option => option.defaultSelected).at(-1) ??',
        replace: '    options.find(option => option.defaultSelected) ??',
      },
    ],
    tests: fields,
  },
  {
    name: 'a disabled option can be the default',
    edits: [
      {
        file: keep,
        find: '    options.find(option => !option.disabled)',
        replace: '    options[0]',
      },
    ],
    tests: fields,
  },
  {
    name: 'a marker is read by Number alone',
    edits: [{ file: keep, find: '      !/^\\d+$/.test(token) ||\n', replace: '' }],
    tests: fields,
  },
  {
    name: 'a marker may name any binding',
    edits: [
      {
        file: keep,
        find: "      (binding.event !== 'input' && binding.event !== 'change')",
        replace: '      false',
      },
    ],
    tests: fields,
  },
  {
    name: 'a marker may sit on any element',
    edits: [
      {
        file: keep,
        find: '    if (!isField(element)) {',
        replace: '    if (!isField(element) && false) {',
      },
    ],
    tests: fields,
  },
  {
    name: 'the browser draws the keep marker as an attribute',
    edits: [
      {
        file: resumable,
        find: '    const attributes = kept ? given.filter(item => !keeps.has(item)) : given',
        replace: '    const attributes = given',
      },
    ],
    tests: eager,
  },
  {
    name: 'a field with OnChange alone is not kept',
    edits: [
      {
        file: resumable,
        find: "      const ordinal = typed.get('OnInput') ?? typed.get('OnChange')",
        replace: "      const ordinal = typed.get('OnInput')",
      },
    ],
    tests: [...eager, ...refused],
  },
  {
    name: 'a select is no field',
    edits: [{ file: resumable, find: "        tag === 'select' ||\n", replace: '' }],
    tests: eager,
  },
  {
    name: 'every input type is a field',
    edits: [
      {
        file: resumable,
        find: "        (tag === 'input' && (type === undefined || !UNTYPED_INPUTS.has(type.toLowerCase())))",
        replace: "        tag === 'input'",
      },
    ],
    tests: refused,
  },
  {
    name: 'the server serves a field it cannot keep',
    edits: [{ file: index, find: '    if (unkeepable.length > 0) {', replace: '    if (false) {' }],
    tests: refused,
  },
]

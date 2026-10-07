/**
 * `Bundle.follow`, broken in turn:
 * `pnpm mutate packages/bundle/test/follow.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/bundle/test/follow.test.ts']
const file = '../src/placed.ts'

export default [
  {
    name: 'an ask is sent without pending',
    edits: [
      {
        file,
        find: '    if (Option.isNone(ask)) return result',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an ask is sent to an absent child',
    edits: [
      {
        file,
        find: '    if (Option.isNone(child)) return result',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an ask is sent before its owner is ready',
    edits: [
      {
        file,
        find: '    if (!config.ready(child.value)) return result',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a sent ask is kept',
    edits: [
      {
        file,
        find: '    const released: Update.Return<Parent, ParentMessage, R> = {\n      ...result,\n      model: config.release(result.model),\n    }',
        replace:
          '    const released: Update.Return<Parent, ParentMessage, R> = {\n      ...result,\n      model: result.model,\n    }',
      },
    ],
    tests,
  },
  {
    name: 'only the first message is sent',
    edits: [
      {
        file,
        find: '    return config.toMessages(ask.value, child.value).reduce((done, message) => {',
        replace:
          '    return config.toMessages(ask.value, child.value).slice(0, 1).reduce((done, message) => {',
      },
    ],
    tests,
  },
  {
    name: 'the owner’s Commands replace the result’s own',
    edits: [
      {
        file,
        find: '      return {\n        ...next.value,\n        commands: [...(done.commands ?? []), ...(next.value.commands ?? [])],\n      }',
        replace: '      return next.value',
      },
    ],
    tests,
  },
]

const can = '../src/can.ts'
const tests = ['packages/metakit/test/can-options.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: can, find, replace }],
  tests,
})

export default [
  edit(
    'Transition.can drops the rewrite policy',
    'judgeNode(transition.when.node, partial, options?.foreign, options?.rewritePolicy)',
    'judgeNode(transition.when.node, partial, options?.foreign)',
  ),
  edit(
    'Machine.intent drops reader options',
    'can: partial => can(transition, partial, options)',
    'can: partial => can(transition, partial)',
  ),
  edit(
    'Machine.affordances drops reader options',
    'canDispatch(machine, tag, { state }, options)',
    'canDispatch(machine, tag, { state })',
  ),
]

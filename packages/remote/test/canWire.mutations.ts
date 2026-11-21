/**
 * The conversion between `Can` and its wire JSON, broken in turn:
 * `pnpm mutate packages/remote/test/canWire.mutations.ts`.
 */
const tests = ['packages/remote/test/canWire.test.ts']
const file = '../src/can.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a refusal read off the wire loses its CanRefusal',
    'No: ({ refusal }) => Verdict.False(Option.some(refusal)),',
    'No: () => Verdict.False(),',
  ),
  edit(
    'a Yes read off the wire is undecided',
    'Yes: () => Verdict.True(),',
    "Yes: () => Verdict.Unknown(''),",
  ),
  edit(
    'a Can written to the wire keeps one reason',
    "reasons: reason === '' ? [] : reason.split(reasonSeparator)",
    'reasons: [reason]',
  ),
  edit(
    'reasons are joined by a separator a reason may hold',
    "const reasonSeparator = '; '",
    "const reasonSeparator = ', '",
  ),
  edit(
    'a refusal written to the wire loses its CanRefusal',
    'onSome: refusal => CanWire.No({ refusal }),',
    "onSome: () => CanWire.No({ refusal: { _tag: 'Unmet' } }),",
  ),
  edit(
    'a refusal with no CanRefusal is written as a Yes',
    "throw new Error('[foldkit-remote] a refusal with no CanRefusal has no wire value')",
    'return CanWire.Yes({})',
  ),
]

/**
 * A text field's description as a live region, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fieldStatus.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/field.test.ts']

export default [
  {
    name: 'the description is no live region',
    edits: [
      {
        file: '../src/field.ts',
        find: 'h.span([...attributes, h.Role(',
        replace: 'h.span([...attributes, h.Title(',
      },
    ],
    tests,
  },
  {
    name: 'the region is drawn only when there is something to say',
    edits: [
      {
        file: '../src/input.ts',
        find: 'description: statusOf(h, resolved.description, description),',
        replace:
          'description: Option.isNone(description) ? h.empty : statusOf(h, resolved.description, description),',
      },
    ],
    tests,
  },
]

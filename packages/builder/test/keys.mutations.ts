/**
 * A key judged in `update` rather than by the view, broken in turn:
 * `pnpm mutate packages/builder/test/keys.mutations.ts` checks that a test
 * fails for every one.
 */
const builder = '../src/index.ts'
const view = '../../mixins-builder/src/index.ts'
const tests = ['packages/builder/test/builder.test.ts', 'packages/mixins-builder/test/view.test.ts']

export default [
  {
    name: 'a press runs nothing in update',
    edits: [
      {
        file: builder,
        find: '            onSome: sent => own(model, sent),',
        replace: '            onSome: () => ({ model }),',
      },
    ],
    tests,
  },
  {
    name: 'the view judges a press by what it drew',
    edits: [
      {
        file: view,
        find: 'builder.keyPressed(input, key, modifiers)',
        replace: 'builder.keyCommand(input, key, modifiers)',
      },
    ],
    tests,
  },
  {
    name: 'a press while text is edited is taken from the text',
    edits: [
      {
        file: builder,
        find: '      Option.isNone(model.editing) &&\n      commands.some(',
        replace: '      commands.some(',
      },
    ],
    tests,
  },
  {
    name: 'every key is taken, bound or not',
    edits: [
      {
        file: builder,
        find: '      commands.some(command => command.keys.some(spec => pressed(spec, key, modifiers)))\n        ? Option.some(Message.KeyPressed',
        replace: '      true\n        ? Option.some(Message.KeyPressed',
      },
    ],
    tests,
  },
]

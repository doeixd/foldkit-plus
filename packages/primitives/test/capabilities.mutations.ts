/**
 * The primitives' child update capabilities, broken in turn:
 * `pnpm mutate packages/primitives/test/capabilities.mutations.ts`.
 */
const tests = ['packages/primitives/test/capabilities.test.ts']
const dir = '../src/interaction'

export default [
  {
    name: 'Selection.activate replaces instead of activating',
    edits: [
      {
        file: `${dir}/selection.ts`,
        find: 'update(model, Message.Activated({ id }), args),',
        replace: 'update(model, Message.Replaced({ ids: [id] }), args),',
      },
    ],
    tests,
  },
  {
    name: 'TreeNavigation.toggle always opens',
    edits: [
      {
        file: `${dir}/tree-navigation.ts`,
        find: 'isOpen(model, args, id) ? Message.Closed({ id }) : Message.Opened({ id }),',
        replace: 'Message.Opened({ id }),',
      },
    ],
    tests,
  },
  {
    name: 'TreeNavigation.toggle ignores the open-by-default args',
    edits: [
      {
        file: `${dir}/tree-navigation.ts`,
        find: 'isOpen(model, args, id) ? Message.Closed({ id }) : Message.Opened({ id }),',
        replace: 'model.toggled.includes(id) ? Message.Closed({ id }) : Message.Opened({ id }),',
      },
    ],
    tests,
  },
  {
    name: 'LiveAnnounce.announce is assertive by default',
    edits: [
      {
        file: `${dir}/live-announce.ts`,
        find: "politeness: Politeness = 'polite') =>",
        replace: "politeness: Politeness = 'assertive') =>",
      },
    ],
    tests,
  },
  {
    name: 'Typeahead.clear leaves the query',
    edits: [
      {
        file: `${dir}/typeahead.ts`,
        find: 'clear: (model: Model) => update(model, Message.Cleared(), args),',
        replace: 'clear: (model: Model) => ({ model }),',
      },
    ],
    tests,
  },
]

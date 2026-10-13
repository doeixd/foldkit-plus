/**
 * A folded domain's Subscriptions, broken in turn:
 * `pnpm mutate packages/remote/test/fold.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/remote/test/fold.test.ts',
  'examples/foldkit/api-cache/test/story.test.ts',
  'examples/foldkit/api-cache/test/interval.test.ts',
]

export default [
  {
    name: "a folded entry sends the domain's Messages, not the parent's",
    edits: [
      {
        file,
        find: 'Stream.map(entry.dependenciesToStream(dependencies, read), toParentMessage)',
        replace: 'entry.dependenciesToStream(dependencies, read)',
      },
    ],
    tests,
  },
  {
    name: "a folded entry's dependencies are wrapped as a lift wraps them",
    edits: [
      {
        file,
        find: 'markAll(\n          messagesAs(brandEntries(domain.subscriptions(active, options)), toParentMessage),\n        )',
        replace:
          'markAll(\n          Subscription.lift(brandEntries(domain.subscriptions(active, options)))({ read: (model: AppModel) => Option.some(model), toParentMessage }),\n        )',
      },
    ],
    tests,
  },
]

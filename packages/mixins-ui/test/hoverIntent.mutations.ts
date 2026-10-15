/**
 * The hover intent and its hover card, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/hoverIntent.mutations.ts` checks that
 * a test fails for every one.
 */
const file = '../src/hoverIntent.ts'
const recipe = '../src/recipes/hoverCard.ts'
const unit = 'packages/mixins-ui/test/hoverIntent.test.ts'
const browser = 'packages/mixins-ui/test/hoverCard.browser.test.ts'

export default [
  {
    name: 'resolve drops the mixins',
    edits: [
      {
        file,
        find: 'resolveFor(HoverIntentSlots, mixins, context)(render)',
        replace: 'resolveFor(HoverIntentSlots, [], context)(render)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'toView drops the mixins',
    edits: [
      {
        file,
        find: 'draw(resolve(render, mixins, context))',
        replace: 'draw(resolve(render, [], context))',
      },
    ],
    tests: [browser],
  },
  {
    name: "the trigger does not claim the pointer's entry",
    edits: [
      {
        file,
        find: 'capability: Capability.Interactive,\n    events: [Event.Hover, Event.Focus, Event.Blur],',
        replace: 'capability: Capability.Interactive,\n    events: [Event.Focus, Event.Blur],',
      },
    ],
    tests: [unit],
  },
  {
    name: "the panel does not claim the pointer's entry",
    edits: [
      {
        file,
        find: 'capability: Capability.Container,\n    events: [Event.Hover, Event.Focus, Event.Blur],',
        replace: 'capability: Capability.Container,\n    events: [Event.Focus, Event.Blur],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the card is not raised',
    edits: [{ file: recipe, find: '        boxShadow: ref.shadow.lg,\n', replace: '' }],
    tests: [browser],
  },
]

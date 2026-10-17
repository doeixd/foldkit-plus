/**
 * The toast adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toast.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/toast.test.ts']
const gate = ['packages/mixins-ui/test/patterns.test.ts']
const unit = ['packages/mixins-ui/test/toastStack.test.ts']
const browser = ['packages/mixins-ui/test/toast.browser.test.ts']
const file = '../src/toast.ts'
const recipe = '../src/recipes/toast.ts'

export default [
  {
    name: 'the container keeps its base bundles',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'container: builders.container.attrs(render.container),',
        replace: 'container: render.container,',
      },
    ],
    tests,
  },
  {
    name: 'entries keep their base bundles',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'attributes: builders.entry.attrs(entry.attributes),',
        replace: 'attributes: entry.attributes,',
      },
    ],
    tests,
  },
  {
    name: 'the container slot forgets its role',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'container: Slot.make({\n    capability: Capability.Container,\n    attributes: [Attr.Role],\n  }),',
        replace: 'container: Slot.make({\n    capability: Capability.Container,\n  }),',
      },
    ],
    tests: gate,
  },
  {
    name: 'the entry slot forgets its role',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'entry: Slot.make({\n    capability: Capability.Container,\n    attributes: [Attr.Role],\n  }),',
        replace: 'entry: Slot.make({\n    capability: Capability.Container,\n  }),',
      },
    ],
    tests: gate,
  },
  {
    name: 'nothing holds the stack',
    edits: [
      {
        file,
        find: 'if (model.pointer || model.focus || model.hidden) return new Set()',
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a stop forgets what was left',
    edits: [
      {
        file,
        find: 'remaining: remaining => Math.max(0, remaining - elapsed),',
        replace: 'remaining: remaining => remaining,',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'every toast shows, past max too',
    edits: [{ file, find: 'staying.slice(0, model.max)', replace: 'staying' }],
    tests: browser,
  },
  {
    name: 'any swipe dismisses, whichever way and however short',
    edits: [
      {
        file,
        find: 'Math.abs(travel) >= model.threshold && (edge === 0 || Math.sign(travel) === edge)',
        replace: 'true',
      },
    ],
    tests: browser,
  },
  {
    name: 'a settled toast keeps the wait of a loading one',
    edits: [
      { file, find: 'duration: () => duration,', replace: 'duration: () => entry.duration,' },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'an error is spoken politely',
    edits: [{ file, find: "(entry.type !== 'error') === polite", replace: 'polite' }],
    tests: browser,
  },
  {
    name: 'Escape leaves a toast be',
    edits: [{ file, find: "key === 'Escape'", replace: "key === 'Esc'" }],
    tests: browser,
  },
  {
    name: 'an action sends nothing',
    edits: [
      {
        file,
        find: 'outMessage: OutMessage.Acted({ id, value: action.value }),',
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the stack measures no heights',
    edits: [{ file, find: 'offset += natural(item)', replace: 'offset += 0' }],
    tests: browser,
  },
  {
    name: 'focus in the stack holds nothing',
    edits: [{ file, find: "[element, 'focusin', () => offer('focus', true)],", replace: '' }],
    tests: browser,
  },
  {
    name: 'a hidden page holds nothing',
    edits: [
      {
        file,
        find: "() => offer('hidden', owner.visibilityState === 'hidden')],",
        replace: '() => {}],',
      },
    ],
    tests: browser,
  },
  {
    name: 'a card travels under reduced motion',
    edits: [
      {
        file: recipe,
        find: 'transitionDuration: `${travelled(ref.motion.slow)}, ${travelled(ref.motion.slow)}',
        replace: 'transitionDuration: `${ref.motion.slow}, ${travelled(ref.motion.slow)}',
      },
    ],
    tests: browser,
  },
  {
    name: 'a card behind keeps its own height',
    edits: [{ file: recipe, find: "blockSize: 'var(--fk-toast-front)',", replace: '' }],
    tests: browser,
  },
]

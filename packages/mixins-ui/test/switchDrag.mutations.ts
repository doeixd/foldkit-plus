/**
 * The Switch's drag, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/switchDrag.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/switchDrag.browser.test.ts']
const source = '../src/switch.ts'
const recipe = '../src/recipes/toggle.ts'

export default [
  {
    name: 'a drag is also a click',
    edits: [
      {
        file: source,
        find: 'if (event.timeStamp - releasedAt > CLICK_AFTER_DRAG) return',
        replace: 'return',
      },
    ],
    tests,
  },
  {
    name: 'a disabled switch drags',
    edits: [
      {
        file: source,
        find: "element.getAttribute('aria-disabled') === 'true' ||",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'right to left reads the drag as left to right',
    edits: [{ file: source, find: "element.matches(':dir(rtl)') ? -1 : 1", replace: '1' }],
    tests,
  },
  {
    name: 'the middle is a quarter of the way',
    edits: [{ file: source, find: 'place > room / 2', replace: 'place > room / 4' }],
    tests,
  },
  {
    name: 'a press that has not moved past the slop is a drag',
    edits: [{ file: source, find: 'if (Math.abs(along) < DRAG_SLOP) return', replace: '' }],
    tests,
  },
  {
    name: 'a drag that ends on its own side still reports',
    edits: [{ file: source, find: 'if (cancelled || unchanged) {', replace: 'if (cancelled) {' }],
    tests,
  },
  {
    name: 'a cancelled drag still reports',
    edits: [{ file: source, find: 'if (cancelled || unchanged) {', replace: 'if (unchanged) {' }],
    tests,
  },
  {
    name: 'the thumb is not held at the far end',
    edits: [
      {
        file: source,
        find: 'Math.min(Math.max(from + along, 0), room)',
        replace: 'Math.max(from + along, 0)',
      },
    ],
    tests,
  },
  {
    name: 'the thumb does not follow the pointer',
    edits: [{ file: recipe, find: "translate: 'var(--_fk-switch-drag, 0px) 0',", replace: '' }],
    tests,
  },
]

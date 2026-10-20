/**
 * A Sheet and a Drawer swiped from their panels, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sheetSwipe.mutations.ts`.
 */
const touch = [
  'packages/mixins-ui/test/sheetSwipe.touch.browser.test.ts',
  'packages/mixins-ui/test/drawerSwipe.touch.browser.test.ts',
]
const unit = ['packages/mixins-ui/test/sheet.test.ts']
const swipe = '../../primitives/src/dom/swipe.ts'
const sheet = '../src/sheet.ts'
const drawer = '../src/drawer.ts'

export default [
  {
    name: 'a finger drags content that can still scroll',
    edits: [
      {
        file: swipe,
        find: '                          canScroll(touched ?? element, element, scrolls, along) ||\n',
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'a field starts a drag',
    edits: [
      {
        file: swipe,
        find: 'if (field !== null && element.contains(field)) return false',
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'a touch inside the handle drags the panel too',
    edits: [{ file: swipe, find: 'if (owners.has(at)) return false', replace: '' }],
    tests: touch,
  },
  {
    name: 'a mouse drags the content',
    edits: [{ file: swipe, find: "if (touchOnly && type !== 'touch') return", replace: '' }],
    tests: touch,
  },
  {
    name: 'a sideways swipe drags',
    edits: [
      {
        file: swipe,
        find: '                          Math.abs(across) > Math.abs(along) ||\n',
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'a swipe leaves the browser its scroll',
    edits: [{ file: swipe, find: '                      touches.preventDefault()\n', replace: '' }],
    tests: touch,
  },
  {
    name: 'a lowered sheet is not marked',
    edits: [
      {
        file: sheet,
        find: "...(model.point < model.points.length - 1 ? [h.DataAttribute('lowered', '')] : []),",
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'a sheet swiped from its handle alone still drags from its panel',
    edits: [
      {
        file: sheet,
        find: "...(model.swipeFrom === 'panel' ? [h.OnMount(swipe(true))] : []),",
        replace: 'h.OnMount(swipe(true)),',
      },
    ],
    tests: touch,
  },
  {
    name: 'a sheet never drags from its panel',
    edits: [
      {
        file: sheet,
        find: "...(model.swipeFrom === 'panel' ? [h.OnMount(swipe(true))] : []),",
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'a drawer swiped from its handle alone still drags from its panel',
    edits: [
      {
        file: drawer,
        find: "...(model.swipeFrom === 'panel' ? [h.OnMount(swipe('panel'))] : []),",
        replace: "h.OnMount(swipe('panel')),",
      },
    ],
    tests: touch,
  },
  {
    name: 'a drawer never drags from its panel',
    edits: [
      {
        file: drawer,
        find: "...(model.swipeFrom === 'panel' ? [h.OnMount(swipe('panel'))] : []),",
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'a sheet’s own flick speed is passed over',
    edits: [
      {
        file: sheet,
        find: '  if (velocity > flickSpeed) {',
        replace: '  if (velocity > FLICK_SPEED) {',
      },
    ],
    tests: unit,
  },
  {
    name: 'a sheet’s own close share is passed over',
    edits: [
      {
        file: sheet,
        find: 'if (dismissible && now - lowest >= closeShare * (size - lowest))',
        replace: 'if (dismissible && now - lowest >= CLOSE_SHARE * (size - lowest))',
      },
    ],
    tests: unit,
  },
  {
    name: 'a swipe of no speed is taken',
    edits: [{ file: sheet, find: 'if (!(flickSpeed > 0))', replace: 'if (false)' }],
    tests: unit,
  },
  {
    name: 'a close share past the whole panel is taken',
    edits: [
      {
        file: sheet,
        find: 'if (!(closeShare > 0 && closeShare <= 1))',
        replace: 'if (!(closeShare > 0))',
      },
    ],
    tests: unit,
  },
]

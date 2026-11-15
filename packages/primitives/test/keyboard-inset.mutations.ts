const file = '../src/dom/keyboard-inset.ts'
const unit = ['packages/primitives/test/keyboard-inset.test.ts']

export default [
  {
    name: 'a pinch zoom reads as a keyboard',
    edits: [
      {
        file,
        find: 'view.visualViewport === null || view.visualViewport.scale > 1 + ZOOM_EPSILON',
        replace: 'view.visualViewport === null',
      },
    ],
    tests: unit,
  },
  {
    name: 'a scale a hair off 1 reads as a pinch zoom',
    edits: [{ file, find: 'const ZOOM_EPSILON = 0.01', replace: 'const ZOOM_EPSILON = 0' }],
    tests: unit,
  },
  {
    name: 'a pinched-out page loses its keyboard',
    edits: [
      {
        file,
        find: 'view.visualViewport.scale > 1 + ZOOM_EPSILON',
        replace: 'view.visualViewport.scale !== 1',
      },
    ],
    tests: unit,
  },
  {
    name: 'the Mount ignores the scale it is given',
    edits: [
      {
        file,
        find: 'const measure = () => target.style.setProperty(KEYBOARD_INSET, `${keyboardInset(view)}px`)',
        replace:
          'const measure = () => target.style.setProperty(KEYBOARD_INSET, `${Math.max(0, Math.floor(view.innerHeight - viewport.height - viewport.offsetTop))}px`)',
      },
    ],
    tests: ['packages/primitives/test/keyboard-inset.browser.test.ts'],
  },
]

/**
 * `PointerPosition`, broken in turn:
 * `pnpm mutate packages/primitives/test/pointer-position.mutations.ts`.
 */
const source = '../src/dom/pointer-position.ts'
const unit = 'packages/primitives/test/pointer-position.test.ts'
const browser = 'packages/primitives/test/pointer-position.browser.test.ts'

export default [
  {
    name: 'the padding box starts at the border, not inside it',
    edits: [{ file: source, find: 'left: rect.left + border.left,', replace: 'left: rect.left,' }],
    tests: [unit, browser],
  },
  {
    name: "the padding box's width keeps the border",
    edits: [
      {
        file: source,
        find: 'width: Math.max(0, rect.width - border.left - border.right),',
        replace: 'width: Math.max(0, rect.width),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a box narrower than its border is negative',
    edits: [
      {
        file: source,
        find: 'height: Math.max(0, rect.height',
        replace: 'height: Math.max(-Infinity, rect.height',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the element is measured from its border box',
    edits: [
      {
        file: source,
        find: 'border: borderOf(getComputedStyle(element))',
        replace: 'border: { top: 0, right: 0, bottom: 0, left: 0 }',
      },
    ],
    // The signature pad's 1px border once offset every stroke.
    tests: [browser, 'packages/mixins-ui/test/signaturePad.browser.test.ts'],
  },
  {
    // What it read before: a thumb or a stroke laid out against the padding
    // box then sat off the pointer by the padding.
    name: 'places are read in the content box',
    edits: [
      {
        file: source,
        find: 'border: borderOf(getComputedStyle(element)),',
        replace:
          'border: ((style, border) => ({ top: border.top + parseFloat(style.paddingTop), right: border.right + parseFloat(style.paddingRight), bottom: border.bottom + parseFloat(style.paddingBottom), left: border.left + parseFloat(style.paddingLeft) }))(getComputedStyle(element), borderOf(getComputedStyle(element))),',
      },
    ],
    tests: [
      browser,
      'packages/mixins-ui/test/colorPicker.browser.test.ts',
      'packages/mixins-ui/test/angleSlider.browser.test.ts',
      'packages/mixins-ui/test/signaturePad.browser.test.ts',
    ],
  },
  {
    name: 'the pressure is not the pointer’s',
    edits: [{ file: source, find: 'pressure: event.pressure,', replace: 'pressure: 0.5,' }],
    tests: [browser],
  },
  {
    name: 'a move drops its coalesced places',
    edits: [
      {
        file: source,
        find: 'points: coalesced.length > 0 ? coalesced.map(one => pointIn(box, one)) : [point],',
        replace: 'points: [point],',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the pointer is not captured',
    edits: [{ file: source, find: 'element.setPointerCapture(event.pointerId)', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a Mount ended mid-press keeps the capture',
    edits: [{ file: source, find: 'element.releasePointerCapture(pointerId)', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the moves and the release stay listened to after it',
    edits: [
      {
        file: source,
        find: '            for (const [type, listener] of during) element.removeEventListener(type, listener)\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the moves and the release are listened to from the start',
    edits: [
      {
        file: source,
        find: "          element.addEventListener('pointerdown', down)\n",
        replace:
          "          element.addEventListener('pointerdown', down)\n          for (const [type, listener] of during) element.addEventListener(type, listener)\n",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a release leaves the pointer held',
    edits: [
      {
        file: source,
        find: '            const pointerId = held.value\n            held = Option.none()\n',
        replace: '            const pointerId = held.value\n',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a cancel reads as completed',
    edits: [
      {
        file: source,
        find: "['pointercancel', end(false)],",
        replace: "['pointercancel', end(true)],",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a secondary button presses',
    edits: [
      {
        file: source,
        find: 'if (!(event instanceof PointerEvent) || event.button !== 0) return',
        replace: 'if (!(event instanceof PointerEvent)) return',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a second pointer takes over the press',
    edits: [
      {
        file: source,
        find: '              if (!ours(event)) return\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the same pointer pressed again ends nothing',
    edits: [
      {
        file: source,
        find: '              release()\n              offer(PointerReleased.make({ completed: false }))\n',
        replace: '              release()\n',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a press leaves the browser its focus and text selection',
    edits: [{ file: source, find: '            event.preventDefault()\n', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a press focuses nothing',
    edits: [{ file: source, find: 'if (into instanceof HTMLElement) into.focus()', replace: '' }],
    tests: [browser],
  },
]

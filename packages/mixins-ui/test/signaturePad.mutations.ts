/**
 * The signature pad, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/signaturePad.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/signaturePad.test.ts'
const browser = 'packages/mixins-ui/test/signaturePad.browser.test.ts'
const source = '../src/signaturePad.ts'

export default [
  {
    name: 'a second pointer starts a stroke over the first',
    edits: [
      { file: source, find: 'if (Option.isSome(model.drawing)) return just(model)', replace: '' },
    ],
    tests: [unit],
  },
  {
    name: 'close points are kept',
    edits: [{ file: source, find: 'const MIN_DISTANCE = 1', replace: 'const MIN_DISTANCE = 0' }],
    tests: [unit],
  },
  {
    name: 'a control drawn at another size is not scaled',
    edits: [
      {
        file: source,
        find: 'x: box.width > 0 ? (raw.x * space.width) / box.width : raw.x,',
        replace: 'x: raw.x,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a pen’s pressure is ignored',
    edits: [
      {
        file: source,
        find: 'if (stroke.pressure) pressure = point.pressure',
        replace: 'if (false) pressure = point.pressure',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'speed does not thin a stroke',
    edits: [
      {
        file: source,
        find: 'pressure = Math.min(1, pressure + (1 - speed - pressure) * speed * PRESSURE_RATE)',
        replace: 'pressure = 0.5',
      },
    ],
    tests: [unit],
  },
  {
    name: 'pressure does not change the width',
    edits: [
      {
        file: source,
        find: 'Math.max(0.25, pen.size * (0.5 - pen.thinning * (0.5 - at)))',
        replace: 'pen.size * 0.5',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a single press draws nothing',
    edits: [
      {
        file: source,
        find: 'if (!spread) return arc(placed[0]!, placed[0]!.radius, 0, 2 * Math.PI, 16)',
        replace: 'if (!spread) return []',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the start cap turns inward, crossing the outline',
    edits: [
      {
        file: source,
        find: 'angle(start, right[0]!), -Math.PI',
        replace: 'angle(start, right[0]!), Math.PI',
      },
    ],
    tests: [unit],
  },
  {
    name: 'undo takes the first stroke away',
    edits: [
      {
        file: source,
        find: 'strokes: () => model.strokes.slice(0, -1)',
        replace: 'strokes: () => model.strokes.slice(1)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a typed name is written unescaped',
    edits: [{ file: source, find: ".replaceAll('<', '&lt;')", replace: '' }],
    tests: [unit],
  },
  {
    name: 'a press is measured from the border, not inside it',
    edits: [{ file: source, find: 'left: left + element.clientLeft,', replace: 'left,' }],
    tests: [browser],
  },
  {
    name: 'a press selects text and is not kept from the page',
    edits: [{ file: source, find: '            event.preventDefault()', replace: '' }],
    tests: [browser],
    survives:
      'A dispatched pointerdown starts no text selection or compatibility mouse events either way; what preventDefault keeps away needs a real press.',
  },
  {
    name: 'the PNG is drawn at the pad’s size, not its scale',
    edits: [{ file: source, find: 'context.scale(scale, scale)', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the PNG draws no strokes',
    edits: [
      {
        file: source,
        find: 'for (const stroke of model.strokes) context.fill(new Path2D(pathOf(stroke, model.pen)))',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the line sits at the bottom of the pad',
    edits: [
      {
        file: '../src/recipes/signaturePad.ts',
        find: 'top: `${BASELINE * 100}%`,',
        replace: 'bottom: 0,',
      },
    ],
    tests: [browser],
  },
  {
    name: '"Sign here" stays after something is signed',
    edits: [
      {
        file: '../src/recipes/signaturePad.ts',
        find: "Style.nest(':not([data-empty]) > * > &', { opacity: '0' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
]

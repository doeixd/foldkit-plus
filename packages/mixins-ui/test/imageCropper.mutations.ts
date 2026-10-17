/**
 * The image cropper, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/imageCropper.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/imageCropper.test.ts'
const browser = 'packages/mixins-ui/test/imageCropper.browser.test.ts'
const source = '../src/imageCropper.ts'

export default [
  {
    name: 'a drag moves from the crop of the last move, not the one it began with',
    edits: [
      {
        file: source,
        find: 'return dragged(model, part, deltaX, deltaY, drag)',
        replace:
          'return dragged(model, part, deltaX, deltaY, { ...drag, crop: Option.getOrThrow(model.image).crop })',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a handle resizes past the image',
    edits: [
      {
        file: source,
        find: 'const roomX = room(sx, ax, bounds.x, bounds.x + bounds.width)',
        replace: 'const roomX = Infinity',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a corner at a locked aspect follows its width alone',
    edits: [
      {
        file: source,
        find: 'const led = Math.max(sx === 0 ? 0 : wanted.width, sy === 0 ? 0 : wanted.height * ratio)',
        replace: 'const led = sx === 0 ? wanted.height * ratio : wanted.width',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a second pointer on another part steers the drag',
    edits: [{ file: source, find: 'if (drag.part !== part) return model', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a drag or a key moves by image pixels, not screen pixels',
    edits: [
      {
        file: source,
        find: 'const [dx, dy] = [screenX / frame.scale, screenY / frame.scale]',
        replace: 'const [dx, dy] = [screenX, screenY]',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'zoom keeps the crop in image pixels, so the selection grows on screen',
    edits: [
      {
        file: source,
        find: 'const [width, height] = [from.width * ratio, from.height * ratio]',
        replace: 'const [width, height] = [from.width, from.height]',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a pan runs past the image',
    edits: [
      {
        file: source,
        find: `        const focus = heldFocus(
          { x: from.focus.x - dx, y: from.focus.y - dy },
          size,
          viewport,
          frame.scale,
        )`,
        replace: '        const focus = { x: from.focus.x - dx, y: from.focus.y - dy }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a clockwise turn carries the crop as a counterclockwise one',
    edits: [
      {
        file: source,
        find: 'clockwise ? { x: size.height - point.y, y: point.x } :',
        replace: 'clockwise ? { x: point.y, y: size.width - point.x } :',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the least crop has no floor on screen',
    edits: [
      { file: source, find: 'const LEAST_ON_SCREEN = 24', replace: 'const LEAST_ON_SCREEN = 0' },
    ],
    tests: [unit],
  },
  {
    name: 'an aspect that is no ratio is taken',
    edits: [
      {
        file: source,
        find: 'Equal.equals(aspect, model.aspect) || Option.exists(aspect, ratio => !isRatio(ratio))',
        replace: 'Equal.equals(aspect, model.aspect)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the selection is drawn at image pixels, unscaled',
    edits: [
      {
        file: source,
        find: "'--fk-cropper-w': px(image.crop.width * frame.scale),",
        replace: "'--fk-cropper-w': px(image.crop.width),",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the viewport is measured on its side',
    edits: [
      {
        file: source,
        find: 'lift(Message.MeasuredViewport({ width, height })),',
        replace: 'lift(Message.MeasuredViewport({ width: height, height: width })),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'an image that loads after it is drawn is never measured',
    edits: [{ file: source, find: "element.addEventListener('load', report)", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the wheel scrolls the page too',
    edits: [{ file: source, find: '            event.preventDefault()', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the export ignores the turn',
    edits: [{ file: source, find: 'context.rotate((args.rotation * Math.PI) / 180)', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a round crop exports square',
    edits: [{ file: source, find: 'if (args.round) {', replace: 'if (false) {' }],
    tests: [browser],
  },
  {
    name: 'every handle sits on the selection’s left edge',
    edits: [
      {
        file: '../src/recipes/imageCropper.ts',
        find: "left: `calc(${v('x')} + ${v('w')} * ${across})`,",
        replace: "left: v('x'),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the image is hidden by any ancestor without the ready mark',
    edits: [
      {
        file: '../src/recipes/imageCropper.ts',
        find: "Style.pseudo(':not([data-ready])', { visibility: 'hidden' }),",
        replace: "Style.nest(':not([data-ready]) &', { visibility: 'hidden' }),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an unplaced image is drawn',
    edits: [
      {
        file: '../src/recipes/imageCropper.ts',
        find: "Style.pseudo(':not([data-ready])', { visibility: 'hidden' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
]

/**
 * The Sheet, its drag and its recipe, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sheet.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/sheet.test.ts'
const browser = 'packages/mixins-ui/test/sheet.browser.test.ts'

export default [
  {
    name: 'a right sheet sits in the middle',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "right: 'stretch right',",
        replace: "right: 'stretch center',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'every edge is bordered',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'each === facing ? ref.border.thin : ',
        replace: 'true ? ref.border.thin : ',
      },
    ],
    tests: [browser],
  },
  {
    name: 'every corner takes the radius',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'corner.includes(facing) ? radius : ',
        replace: 'true ? radius : ',
      },
    ],
    tests: [browser],
  },
  {
    name: "the Dialog's centering margin stays",
    edits: [{ file: '../src/recipes/sheet.ts', find: "          margin: '0',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the panel does not follow the drag',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "const travel = 'var(--fk-sheet-offset, calc((1 - var(--fk-sheet-snap, 1)) * 100%))'",
        replace: "const travel = 'calc((1 - var(--fk-sheet-snap, 1)) * 100%)'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the panel rests fully open at every point',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "const travel = 'var(--fk-sheet-offset, calc((1 - var(--fk-sheet-snap, 1)) * 100%))'",
        replace: "const travel = 'var(--fk-sheet-offset, 0px)'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a drag eases after the pointer',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "        Style.pseudo('[data-dragging]', { transitionDuration: '0s' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the handle is only as large as its bar',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "Style.nest('&::after', {",
        replace: "Style.nest('&::backdrop', {",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the page steps back behind every sheet, closed ones too',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "...(options.scalesPage === true ? [h.DataAttribute('scales-page', '')] : []),",
        replace: "h.DataAttribute('scales-page', ''),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a drag down is read as one up',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "bottom: { axis: 'y', sign: 1 },",
        replace: "bottom: { axis: 'y', sign: -1 },",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a flick is read as a slow release',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'velocity: along(velocityX, velocityY),',
        replace: 'velocity: 0,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a slow drag never takes it away',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'export const CLOSE_SHARE = 0.25',
        replace: 'export const CLOSE_SHARE = 1',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a sheet that may not be dismissed is taken away by a flick',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'Option.some(next) : dismissible ? Option.none() : Option.some(0)',
        replace: 'Option.some(next) : Option.none()',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a drag past fully open is not damped',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'return shown >= 0 ? shown : ',
        replace: 'return true ? shown : ',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a press on the handle stays where it is',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'const next = (model.point + 1) % model.points.length',
        replace: 'const next = model.point',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the drag is read against the handle, not the panel',
    edits: [
      { file: '../src/sheet.ts', find: "Swipe({ measure: '[data-sheet]' })", replace: 'Swipe({})' },
    ],
    tests: [browser],
  },
  {
    name: 'it opens again where it last rested',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'dialogStep(model, UiDialog.open(model.dialog), { point: model.opensAt })',
        replace: 'dialogStep(model, UiDialog.open(model.dialog))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a covered bottom sheet stays on its edge',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "side === 'bottom' ? `calc(${travel} - ${ref.space.md})` : travel",
        replace: 'travel',
      },
    ],
    tests: [browser],
  },
  {
    name: 'every Dialog Message drops the drag',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'drag: drag => (ends ? Option.none() : drag),',
        replace: 'drag: () => Option.none(),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a drag outlives the Sheet closing',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'drag: drag => (ends ? Option.none() : drag),',
        replace: 'drag: drag => drag,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a sheet resting partway is not marked',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'model.points.some(point => point < 1)',
        replace: 'false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'every sheet is marked as resting partway',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'model.points.some(point => point < 1)',
        replace: 'true',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a sheet resting partway is as tall as its content',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "{ blockSize: 'var(--_fk-sheet-block, 80%)' }",
        replace: '{}',
      },
    ],
    tests: [browser],
  },
]

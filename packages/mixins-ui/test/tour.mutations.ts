/**
 * The tour, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tour.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/tour.ts'
const recipe = '../src/recipes/tour.ts'
const unit = 'packages/mixins-ui/test/tour.test.ts'
const browser = 'packages/mixins-ui/test/tour.browser.test.ts'

export default [
  {
    name: 'Back goes before the first step',
    edits: [
      {
        file,
        find: '!model.open || step < 0 || step > last',
        replace: '!model.open || step > last',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Next on the last step stays',
    edits: [
      {
        file,
        find: 'model.step >= last ? ended(model, true) : went(model, model.step + 1)',
        replace: 'went(model, model.step + 1)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a finished tour reads as skipped',
    edits: [
      {
        file,
        find: 'model.step >= last ? ended(model, true)',
        replace: 'model.step >= last ? ended(model, false)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowRight does nothing',
    edits: [{ file, find: "if (key === 'ArrowRight') return next(model)", replace: '' }],
    tests: [unit, browser],
  },
  {
    name: 'Escape does nothing',
    edits: [{ file, find: "if (key === 'Escape') return ended(model, false)", replace: '' }],
    tests: [unit, browser],
  },
  {
    name: 'the end gives focus to nothing',
    edits: [
      {
        file,
        find: 'onSome: elementId => [FocusOpener({ elementId })],',
        replace: 'onSome: () => [],',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a late answer for another target takes the step to the middle',
    edits: [
      {
        file,
        find: '        !Option.contains(targetOf(steps, model.step), target)\n',
        replace: '        false\n',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a missing target is told again',
    edits: [{ file, find: '        Option.isSome(model.missing) ||\n', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the middle step is not focused',
    edits: [
      {
        file,
        find: 'commands: [ShowStep({ id: model.id, target: Option.none() })],',
        replace: 'commands: [],',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a far target stays out of view',
    edits: [
      {
        file,
        find: 'document.getElementById(elementId)?.scrollIntoView({',
        replace: 'document.getElementById(elementId)?.getBoundingClientRect?.({',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a step in the middle takes no focus',
    edits: [
      {
        file,
        find: 'document.getElementById(panelId(id))?.focus({ preventScroll: true })',
        replace: 'undefined',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the cutout stays where the page was',
    edits: [{ file, find: "view?.addEventListener('scroll', place, true)", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the cutout looks for its target once',
    edits: [
      {
        file,
        find: "attributeFilter: ['data-target']",
        replace: "attributeFilter: ['data-never']",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a placed step takes no focus',
    edits: [{ file, find: 'focusAfterPosition: true,', replace: 'focusAfterPosition: false,' }],
    tests: [browser],
  },
  {
    name: 'the anchor cannot place the step',
    edits: [{ file, find: "h.Style({ position: 'absolute' }),", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the layer is no top-layer box',
    edits: [
      { file, find: "...layerBox(h, { '--fk-tour-padding': `${padding}px` }),", replace: '' },
    ],
    tests: [browser],
  },
  {
    name: 'a missing target stays anchored',
    edits: [
      {
        file,
        find: 'const target = Option.isSome(model.missing) ? Option.none() : Option.fromNullishOr(step.target)',
        replace: 'const target = Option.fromNullishOr(step.target)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the step reads the arrows physically right to left',
    edits: [
      {
        file,
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'Escape skips when told not to',
    edits: [
      {
        file,
        find: "if (key === 'Escape' && options.closeOnEscape === false) return Option.none()",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the target cannot be used',
    edits: [{ file, find: 'anchored && options.interactive !== false', replace: 'false' }],
    tests: [unit, browser],
  },
  {
    name: 'a target not to be used can be',
    edits: [{ file, find: 'anchored && options.interactive !== false', replace: 'anchored' }],
    tests: [unit, browser],
  },
  {
    name: 'the hole is the whole page',
    edits: [
      { file, find: 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ', replace: 'polygon(' },
    ],
    tests: [browser],
  },
  {
    name: 'a press on the dim always skips',
    edits: [{ file, find: 'options.dismissOnOutside === true ?', replace: 'true ?' }],
    tests: [unit],
  },
  {
    name: 'Back shows on the first step',
    edits: [{ file, find: '...(model.step > 0 ? [action(', replace: '...(true ? [action(' }],
    tests: [unit],
  },
  {
    name: 'the last step says Next',
    edits: [
      {
        file,
        find: "isLast ? (labels.done ?? 'Done')",
        replace: "false ? (labels.done ?? 'Done')",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the place counts from 0',
    edits: [{ file, find: '`${step + 1} of ${count}`', replace: '`${step} of ${count}`' }],
    tests: [unit],
  },
  {
    name: 'the cutout does not reach past its target',
    edits: [
      {
        file,
        find: 'const padding = options.padding ?? 8',
        replace: 'const padding = options.padding ?? 0',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the ring takes presses meant for the target',
    edits: [{ file, find: "                  pointerEvents: 'none',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the dim does not fill around a step in the middle',
    edits: [
      {
        file: recipe,
        find: 'Style.pseudo(\'[data-spotlit="false"]\', { background: dim }),',
        replace: '',
      },
    ],
    tests: [browser],
  },
]

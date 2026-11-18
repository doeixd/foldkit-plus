/**
 * The tour, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tour.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/tour.ts'
const recipe = '../src/recipes/tour.ts'
// The cutout's Mount, `foldkit-primitives/dom`'s.
const trackBox = '../../primitives/src/dom/track-box.ts'
const unit = 'packages/mixins-ui/test/tour.test.ts'
const browser = 'packages/mixins-ui/test/tour.browser.test.ts'
const bundles = 'packages/mixins-ui/test/layoutBundles.test.ts'
const advance = '../src/tour/advanceOnClick.ts'
const bundle = '../src/bundles/tour.ts'

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
        find: 'model.step >= last ? ended(true) : went(model.step + 1)',
        replace: 'went(model.step + 1)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a finished tour reads as skipped',
    edits: [
      {
        file,
        find: 'model.step >= last ? ended(true)',
        replace: 'model.step >= last ? ended(false)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowRight does nothing',
    edits: [{ file, find: "if (key === 'ArrowRight') return next()", replace: '' }],
    tests: [unit, browser],
  },
  {
    name: 'Escape does nothing',
    edits: [{ file, find: "if (key === 'Escape') return ended(false)", replace: '' }],
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
    edits: [
      {
        file: trackBox,
        find: "view?.addEventListener('scroll', place, { capture: true, passive: true })",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the cutout looks for its target once',
    edits: [
      {
        file: trackBox,
        find: 'attributeFilter: [TRACK_TARGET_ATTRIBUTE],',
        replace: "attributeFilter: ['data-never'],",
      },
    ],
    tests: [browser],
    // `track-box.mutations.ts` kills it, with the attribute changed alone.
    survives:
      "a step's change also redraws its panel, and the document's change reads the target again",
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
        find: 'Message.Pressed({ key: readingKey(key, input.direction) })',
        replace: 'Message.Pressed({ key })',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'Escape skips when told not to',
    edits: [
      {
        file,
        find: 'input.closeOnEscape === false',
        replace: 'false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the target cannot be used',
    edits: [
      {
        file,
        find: 'const usable = anchored && options.interactive !== false',
        replace: 'const usable = false',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a target not to be used can be',
    edits: [
      {
        file,
        find: 'const usable = anchored && options.interactive !== false',
        replace: 'const usable = anchored',
      },
    ],
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
        find: 'isLast ? said.done : said.next',
        replace: 'said.next',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the place counts from 0',
    edits: [
      {
        file,
        find: 'fill(said.progress, { step: model.step + 1, count })',
        replace: 'fill(said.progress, { step: model.step, count })',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the words given are ignored',
    edits: [
      { file, find: 'const said = wordsOf(words, options.words)', replace: 'const said = words' },
    ],
    tests: [unit],
  },
  {
    name: "a step's content is not drawn",
    edits: [{ file, find: 'options.content === undefined', replace: 'true' }],
    tests: [unit],
  },
  {
    name: 'advanceOnClick listens with the target out of reach',
    edits: [
      {
        file,
        find: 'usable && options.advanceOnClick !== undefined',
        replace: 'options.advanceOnClick !== undefined',
      },
    ],
    tests: [unit],
  },
  {
    name: 'advanceOnClick hears a press anywhere',
    edits: [
      {
        file: advance,
        find: 'target !== null && event.target instanceof Node && target.contains(event.target)',
        replace: 'target !== null',
      },
    ],
    tests: [browser],
  },
  {
    name: 'update ignores the steps the Model holds',
    edits: [
      {
        file,
        find: 'const { steps } = config ?? model',
        replace: 'const steps = config?.steps ?? []',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the Bundle starts with no steps',
    edits: [
      {
        file: bundle,
        find: 'init: args => ({ model: init(args) }),',
        replace: 'init: args => ({ model: init({ id: args.id }) }),',
      },
    ],
    tests: [bundles],
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
    name: "the cutout is not told its target's corner",
    edits: [
      {
        file,
        find: "TrackBox({ name: 'tour', radius: true })",
        replace: "TrackBox({ name: 'tour' })",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the ring keeps a corner of its own',
    edits: [
      {
        file: recipe,
        find: "borderRadius: 'calc(var(--fk-tour-radius, 0px) + var(--fk-tour-padding, 0px))',",
        replace: "borderRadius: '8px',",
      },
    ],
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
  {
    name: "the application's routes on a step are dropped",
    edits: [{ file, find: '...(options.routes ?? []),', replace: '' }],
    tests: [unit, browser],
  },
  {
    name: 'Shift stops a step key',
    edits: [
      {
        file,
        find: 'on: [...Behaviors.Keys.withShift(key)],',
        replace: 'on: [Behaviors.Keys.chord(key)],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'focusReturn gives focus back to nothing',
    edits: [
      {
        file: '../src/tour/focusReturn.ts',
        find: 'mount: () => FocusReturn(),',
        replace: 'attributes: () => [],',
      },
    ],
    tests: [browser],
  },
]

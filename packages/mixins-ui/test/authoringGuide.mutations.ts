/**
 * The guide's chip filter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/authoringGuide.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/authoringGuide.test.ts'
const browser = 'packages/mixins-ui/test/authoringGuide.browser.test.ts'
const ssr = 'packages/mixins-ui/test/authoringGuide.ssr.test.ts'
const source = './authoringGuide.ts'

export default [
  {
    name: 'a chip is taken out on the first Presence Message, before its exit has run',
    edits: [
      {
        file: source,
        find: "phaseOf(model, id) === 'hidden'\n      ? Picked",
        replace: 'true\n      ? Picked',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removed chip stays picked',
    edits: [
      {
        file: source,
        find: 'model.picks.selected.filter(each => each !== id)',
        replace: 'model.picks.selected',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a chip already leaving is hidden again',
    edits: [
      {
        file: source,
        find: "Object.hasOwn(model.presence, id) && phaseOf(model, id) === 'shown'",
        replace: 'Object.hasOwn(model.presence, id)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the listbox does not say it takes several picks',
    edits: [
      {
        file: source,
        find: "Selection.behavior(Picks, pickArgs)(Filter)({\n  container: 'list',",
        replace: 'Selection.behavior(Picks, pickArgs)(Filter)({',
      },
    ],
    tests: [unit, ssr],
  },
  {
    name: 'the remove button is drawn with nothing picked',
    edits: [
      {
        file: source,
        find: '...(model.picks.selected.length === 0\n        ? []',
        replace: '...(false\n        ? []',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Space mid-word picks as well as typing',
    edits: [
      {
        file: source,
        find: "item?.id === undefined || (key === ' ' && input.nav.query !== '')",
        replace: 'item?.id === undefined',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Delete does nothing',
    edits: [
      {
        file: source,
        find: "on: [Keys.chord('Delete'), Keys.chord('Backspace')],",
        replace: "on: [Keys.chord('Backspace')],",
      },
    ],
    tests: [browser],
  },
  {
    name: 'focus falls to the previous chip first',
    edits: [{ file: source, find: "chip: ['next', 'previous']", replace: "chip: ['previous']" }],
    tests: [browser],
  },
  {
    name: 'focus on the remove button is lost when it goes',
    edits: [{ file: source, find: ", remove: ['stop']", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the arrows land on a chip that is leaving',
    edits: [
      {
        file: source,
        find: "disabled: chip => phaseOf(model, chipId(model, chip)) !== 'shown',",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "the page's Escape claims the key with nothing picked",
    edits: [
      {
        file: source,
        find: 'input.picks.selected.length === 0\n      ? Option.none()',
        replace: 'false\n      ? Option.none()',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the picked look sits in the base, where each look beats it',
    edits: [
      {
        file: source,
        find: "Style.pseudo('[data-presence=\"hiding\"]', { opacity: '0' }),\n    ),",
        replace:
          "Style.pseudo('[data-presence=\"hiding\"]', { opacity: '0' }),\n      picked,\n    ),",
      },
      {
        file: source,
        find: 'color: t.text.default,\n          }),\n          picked,\n        ),\n      },\n      soft',
        replace: 'color: t.text.default,\n          }),\n        ),\n      },\n      soft',
      },
    ],
    tests: [browser],
  },
]

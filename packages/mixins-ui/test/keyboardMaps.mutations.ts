/**
 * The keys of widgets drawn in `keyboardMaps` and `keyboardMapsPopups`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/keyboardMaps.mutations.ts`. Checkbox, switch, popover,
 * hover card, file drop, radio group and the date grid are upstream's keys and have no line of
 * this repository to break; their tests are the guard against a change that adds or drops one.
 */
const plain = 'packages/mixins-ui/test/keyboardMaps.browser.test.ts'
const popups = 'packages/mixins-ui/test/keyboardMapsPopups.browser.test.ts'

export default [
  {
    name: 'an accordion trigger takes no press',
    edits: [
      {
        file: '../src/accordion.ts',
        find: '...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onToggle(item.id))]),',
        replace: '...(disabled ? [h.Disabled(true)] : []),',
      },
    ],
    tests: [plain],
  },
  {
    name: 'a completed step takes no press',
    edits: [
      {
        file: '../src/steps.ts',
        find: "builders.trigger.attrs([h.Type('button'), h.OnClick(onSelect(index))]),",
        replace: "builders.trigger.attrs([h.Type('button')]),",
      },
    ],
    tests: [plain],
  },
  {
    name: 'a combobox ArrowUp is not a key',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "Match.when('ArrowUp', () => {",
        replace: "Match.when('ArrowUpX', () => {",
      },
    ],
    tests: [popups],
  },
  {
    name: 'a combobox Enter chooses nothing',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "Match.when('Enter', () => {",
        replace: "Match.when('EnterX', () => {",
      },
    ],
    tests: [popups],
  },
  {
    name: 'a combobox arrow continues from the drawn active option, not the last press',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: '    pressed = { isOpen: true, activeIndex: Option.some(targetIndex) }',
        replace: '',
      },
    ],
    tests: [popups],
  },
  {
    name: 'a combobox Enter chooses the drawn active option, not the last press',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'const maybeCommitIndex = validIndex(pressed.activeIndex)',
        replace: 'const maybeCommitIndex = maybeValidActiveItemIndex',
      },
    ],
    tests: [popups],
  },
  {
    name: 'a second arrow before the next frame reopens a closed combobox',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: '    pressed = { isOpen: true, activeIndex: Option.some(index) }',
        replace: '',
      },
    ],
    tests: [popups],
  },
  {
    name: 'a combobox Escape does not shut it',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "Match.when('Escape', () => {",
        replace: "Match.when('EscapeX', () => {",
      },
    ],
    tests: [popups],
  },
  {
    name: 'the reading keys read the arrows as pressed',
    edits: [
      {
        file: '../src/direction.ts',
        find: 'const key = readingKey(event.key, directionOf(element))',
        replace: 'const key = event.key',
      },
    ],
    tests: [popups],
  },
]

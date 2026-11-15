/**
 * The menu bar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menubar.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/menubar.ts'
const unit = 'packages/mixins-ui/test/menubar.test.ts'
const browser = 'packages/mixins-ui/test/menubar.browser.test.ts'

export default [
  {
    name: 'ArrowRight stops at the last trigger',
    edits: [
      {
        file,
        find: 'ArrowRight: (from, last) => (from >= last ? 0 : from + 1),',
        replace: 'ArrowRight: (from, last) => Math.min(from + 1, last),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowLeft stops at the first trigger',
    edits: [
      {
        file,
        find: 'ArrowLeft: (from, last) => (from <= 0 ? last : from - 1),',
        replace: 'ArrowLeft: (_from, _last) => 0,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a shut menu sends focus back to its button',
    edits: [
      {
        file,
        find: 'commands: step.commands.filter(command => command.name !== UiMenu.FocusButton.name),',
        replace: 'commands: step.commands,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'opening a menu leaves the others open',
    edits: [
      {
        file,
        find: 'if (index === keep || !menu.isOpen) return kept(menu)',
        replace: 'return kept(menu)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the arrows across open the next menu on no row',
    edits: [
      {
        file,
        find: 'opened(model, move(index, last), Option.some(0))',
        replace: 'opened(model, move(index, last), Option.none())',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Home and End open a menu while one is open',
    edits: [
      {
        file,
        find: "key === 'ArrowRight' || key === 'ArrowLeft'\n",
        replace: 'true\n',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the pointer opens a menu while every one is shut',
    edits: [
      {
        file,
        find: 'Option.isSome(openIndex(model)) ? opened(model, to, Option.none()) : { model },',
        replace: 'opened(model, to, Option.none()),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a chosen row names the first menu',
    edits: [
      {
        file,
        find: 'OutMessage.Selected({ menu: index, value: selected.value })',
        replace: 'OutMessage.Selected({ menu: 0, value: selected.value })',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a menu Message that changes nothing writes a new Model',
    edits: [
      {
        file,
        find: 'if (step.menu === menu && step.commands.length === 0 && Option.isNone(outMessage)) {',
        replace: 'if (false) {',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every trigger is a tab stop',
    edits: [
      {
        file,
        find: 'h.Tabindex(index === model.stop ? 0 : -1),',
        replace: 'h.Tabindex(0),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a bar key always sends End',
    edits: [
      {
        file,
        find: 'handle: () => Option.some(onMessage(Message.Pressed({ key: reading }))),',
        replace: "handle: () => Option.some(onMessage(Message.Pressed({ key: 'End' }))),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the bar reads the arrows physically right to left',
    edits: [
      {
        file,
        find: "options.direction === 'rtl' ? RTL_KEYS[reading] : reading",
        replace: 'reading',
      },
    ],
    tests: [unit],
  },
  {
    name: 'right to left, ArrowLeft stays ArrowLeft',
    edits: [{ file, find: "ArrowRight: 'ArrowLeft',", replace: "ArrowRight: 'ArrowRight'," }],
    tests: [unit],
  },
  {
    name: 'right to left, ArrowRight stays ArrowRight',
    edits: [{ file, find: "ArrowLeft: 'ArrowRight',", replace: "ArrowLeft: 'ArrowLeft'," }],
    tests: [unit],
  },
  {
    name: "the application's routes on the bar are dropped",
    edits: [{ file, find: '...(options.routes ?? []),', replace: '' }],
    tests: [unit, browser],
  },
  {
    name: 'Shift cancels a bar key',
    edits: [
      {
        file,
        find: "...Behaviors.Keys.withShift(options.direction === 'rtl' ? RTL_KEYS[reading] : reading),",
        replace: "Behaviors.Keys.chord(options.direction === 'rtl' ? RTL_KEYS[reading] : reading),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the bar installs no keydown owner',
    edits: [
      {
        file,
        find: '[...(options.style === undefined ? [] : [options.style.mixin]), keys.mixin]',
        replace: '[...(options.style === undefined ? [] : [options.style.mixin])]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a menu of the bar disables no row',
    edits: [
      {
        file,
        find: 'rowInputs(shown.rows, shown.isRowDisabled, h)',
        replace: 'rowInputs(shown.rows, undefined, h)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a bar given no menu mixins fails to draw',
    edits: [{ file, find: 'options.menuMixins ?? []', replace: 'options.menuMixins' }],
    tests: [unit],
  },
]

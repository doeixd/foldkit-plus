/**
 * The menu bar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menubar.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/menubar.ts'
const unit = 'packages/mixins-ui/test/menubar.test.ts'

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
    name: 'the bar takes every key',
    edits: [
      {
        file,
        find: 'return isBarKey(key) ? Option.some(onMessage(Message.Pressed({ key }))) : Option.none()',
        replace: "return Option.some(onMessage(Message.Pressed({ key: 'End' })))",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the bar reads the arrows physically right to left',
    edits: [
      {
        file,
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests: [unit],
  },
  {
    name: 'right to left, ArrowLeft stays ArrowLeft',
    edits: [
      {
        file: '../src/direction.ts',
        find: "if (key === 'ArrowLeft') return 'ArrowRight'\n",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'right to left, ArrowRight stays ArrowRight',
    edits: [
      {
        file: '../src/direction.ts',
        find: "if (key === 'ArrowRight') return 'ArrowLeft'\n",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'left to right swaps the arrows too',
    edits: [
      {
        file: '../src/direction.ts',
        find: "if (direction !== 'rtl') return key\n",
        replace: '',
      },
    ],
    tests: [unit],
  },
]

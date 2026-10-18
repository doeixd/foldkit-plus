/**
 * The Menu component (submenus, and the menu at a point), broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menuComponent.mutations.ts` checks
 * that a test fails for every one.
 */
const file = '../src/menu.ts'
const unit = 'packages/mixins-ui/test/menuUpdate.test.ts'
const browser = 'packages/mixins-ui/test/menu.browser.test.ts'

export default [
  {
    name: 'the menu draws no direction of its own',
    edits: [
      {
        file,
        find: ': [...resolved.wrapper, h.Dir(options.direction)],',
        replace: ': resolved.wrapper,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a chevron turns under any right-to-left ancestor',
    edits: [
      {
        file: '../src/recipes/menu.ts',
        find: "Style.pseudo(':dir(rtl)', { rotate: '135deg' }),",
        replace: `Style.nest(':where([dir="rtl"]) &', { rotate: '135deg' }),`,
      },
    ],
    tests: [browser],
  },
  {
    name: "an application's Menu drawn at a point keeps its button",
    edits: [
      {
        file,
        find: 'drawMenu({ ...resolved, button: pointButton(resolved.button, point, h) }, h)',
        replace: 'drawMenu(resolved, h)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the menu is never animated',
    edits: [
      {
        file,
        find: 'menu: UiMenu.init({ id, isAnimated, isModal: options.isModal ?? false }),',
        replace: 'menu: UiMenu.init({ id, isModal: options.isModal ?? false }),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'no submenu is animated',
    edits: [
      {
        file,
        find: 'menu: UiMenu.init({ id: `${id}-sub-${index}`, isAnimated }),',
        replace: 'menu: UiMenu.init({ id: `${id}-sub-${index}` }),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the menu is never modal',
    edits: [
      {
        file,
        find: 'menu: UiMenu.init({ id, isAnimated, isModal: options.isModal ?? false }),',
        replace: 'menu: UiMenu.init({ id, isAnimated }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a submenu opens below its row',
    edits: [
      {
        file,
        find: "const submenuSide = options.direction === 'rtl' ? 'left-start' : 'right-start'",
        replace: "const submenuSide = 'bottom-start'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'right to left, a submenu still opens on the right',
    edits: [
      {
        file,
        find: "const submenuSide = options.direction === 'rtl' ? 'left-start' : 'right-start'",
        replace: "const submenuSide = 'right-start'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the menu reads the arrows physically right to left',
    edits: [
      {
        file,
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests: [browser],
  },
  {
    name: 'ArrowRight opens the submenu with no row active',
    edits: [
      {
        file,
        find: 'onSome: index => opened(model, index, Option.some(0)),',
        replace: 'onSome: index => opened(model, index, Option.none()),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'closing a submenu leaves focus where it was',
    edits: [
      {
        file,
        find: 'commands: [...shut.commands, ...ofMenu(result), ...focusPanel(model)],',
        replace: 'commands: [...shut.commands, ...ofMenu(result)],',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the pointer resting on a row opens nothing',
    edits: [
      {
        file,
        find: 'onSome: () => opened(model, row, Option.none()),',
        replace: 'onSome: () => ({ model }),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a left press records the point, not a right one',
    edits: [{ file, find: 'button === 2 ||', replace: 'button === 0 ||' }],
    tests: [browser],
  },
  {
    name: "a press's axes are swapped",
    edits: [
      {
        file,
        find: 'options.onPress({ x: clientX, y: clientY })',
        replace: 'options.onPress({ x: clientY, y: clientX })',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the contextmenu event opens nothing',
    edits: [
      {
        file,
        find: '  h.OnContextMenu(options.onOpen),\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a press is kept for the next open, so the keyboard opens at an old point',
    edits: [
      {
        file,
        find: 'RequestedContextMenu: () =>\n      plain(\n        written(model, { point: model.press, press: Option.none(), holding: Option.none() }),',
        replace:
          'RequestedContextMenu: () =>\n      plain(\n        written(model, { point: model.press, holding: Option.none() }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the mark stays where the button is drawn',
    edits: [
      {
        file,
        find: "onSome: ({ x, y }) => ({ position: 'fixed', left: `${x}px`, top: `${y}px` }),",
        replace: 'onSome: ({ x, y }) => ({ left: `${x}px`, top: `${y}px` }),',
      },
    ],
    tests: [browser],
  },
  {
    name: "the mark keeps the Menu button's ladder height",
    edits: [{ file, find: "  minBlockSize: '0',\n", replace: '' }],
    tests: [browser],
  },
]

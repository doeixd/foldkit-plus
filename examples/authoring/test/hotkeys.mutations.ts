/**
 * The hotkeys section's claims, broken in turn:
 * `pnpm mutate examples/authoring/test/hotkeys.mutations.ts`.
 */
const unit = 'examples/authoring/test/hotkeys.test.ts'
const page = 'examples/authoring/test/hotkeys.browser.test.ts'

export default [
  {
    name: 'a button advertises another chord than the one that runs it',
    edits: [
      {
        file: '../src/hotkeys/view.ts',
        find: 'Option.match(ariaKeyshortcuts(pattern, model.platform), {',
        replace: "Option.match(ariaKeyshortcuts('mod+y', model.platform), {",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a button shows another chord than the one that runs it',
    edits: [
      {
        file: '../src/hotkeys/view.ts',
        find: "Option.getOrElse(formatHotkey(pattern, model.platform), () => '')",
        replace: "Option.getOrElse(formatHotkey('mod+y', model.platform), () => '')",
      },
    ],
    tests: [unit],
  },
  {
    name: 'mod is Control on every platform',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: 'matchHotkey(pattern, press, { platform })',
        replace: "matchHotkey(pattern, press, { platform: 'windows' })",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a press that is a shortcut is ignored by update',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: 'onSome: shortcut => update(model, shortcut),',
        replace: 'onSome: () => ({ model }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an undo names no step',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: '`Undo ${model.history.present.label}`',
        replace: "'Undo'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a redo names the step the undo would take, not the one it brings back',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: '`Redo ${step.label}`',
        replace: '`Redo ${model.history.present.label}`',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a pause does not end a typing step',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: '            within: WITHIN_MS,\n',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every keystroke is a step of its own',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: "group: 'typing',",
        replace: 'group: null,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'typing what is already there records a step',
    edits: [
      {
        file: '../src/hotkeys/app.ts',
        find: 'equals: (present, next) => present.title === next.title,',
        replace: 'equals: () => false,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the browser keeps its own undo for a shortcut',
    edits: [
      {
        file: '../src/hotkeys/mount.ts',
        find: 'preventDefault: press => Option.isSome(chordOf(platform, press))',
        replace: 'preventDefault: () => false',
      },
    ],
    tests: [page],
  },
]

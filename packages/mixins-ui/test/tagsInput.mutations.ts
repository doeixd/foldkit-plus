/**
 * The tags input, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tagsInput.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/tagsInput.test.ts'
const browser = 'packages/mixins-ui/test/tagsInput.browser.test.ts'

export default [
  {
    name: 'the added draft is read again from a frame-old input',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'text.startsWith(front) ? text.slice(front.length) : text',
        replace: 'text',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every added draft is read past, whichever drawing the text came from',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'const behind = model.commits - drawn',
        replace: 'const behind = model.added.length',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the added drafts are kept for good',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'added: () => unseen,',
        replace: 'added: added => added,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a refused commit counts',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'commits: commits => (fresh.length === 0 ? commits : commits + 1),',
        replace: 'commits: commits => commits + 1,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input sends no drawing with its text',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'Message.Typed({ text, drawn: model.commits })',
        replace: 'Message.Typed({ text, drawn: 0 })',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a part past max is added',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '} else if (fresh.length === room) {',
        replace: '} else if (false) {',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a repeat beside new parts goes unnamed',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'if (Option.isNone(refusal)) refusal = Option.some(Refusal.Repeat({ tag: part }))',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a refusal outlives the next edit',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'draft: () => typed,\n              refusal: () => Option.none(),',
        replace: 'draft: () => typed,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a refusal does not count',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'refusals: refusals => (Option.isSome(refusal) ? refusals + 1 : refusals),',
        replace: 'refusals: refusals => refusals,',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the status region is drawn only as it speaks',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "builders.message.attrs([h.Id(messageId(model.id)), h.Role('status')]),",
        replace:
          "builders.message.attrs([h.Id(messageId(model.id)), ...(Option.isSome(said) ? [h.Role('status')] : [])]),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input does not point at the refusal',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '...(Option.isSome(said) ? [h.AriaDescribedBy(messageId(model.id))] : []),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the shake does not travel',
    edits: [
      {
        file: '../src/recipes/tagsInput.ts',
        find: 'animation: `${name} ${travelled(ref.motion.moderate)} ${ref.motion.ease}`,',
        replace: 'animation: `${name} ${ref.motion.moderate} ${ref.motion.ease}`,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'both refusals shake under one name',
    edits: [
      {
        file: '../src/recipes/tagsInput.ts',
        find: '{ even: shake(shakes.even.name), odd: shake(shakes.odd.name) }',
        replace: '{ even: shake(shakes.even.name), odd: shake(shakes.even.name) }',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the delimiter key does not commit',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(model.delimiter)],",
        replace: "on: [Behaviors.Keys.chord('Enter')],",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a tag keeps the spaces around it',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '.map(part => part.trim())',
        replace: '.map(part => part)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a draft adds the same tag twice',
    edits: [{ file: '../src/tagsInput.ts', find: '      seen.add(part)\n', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a draft refused whole is cleared',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "draft: draft => (fresh.length === 0 ? draft : ''),",
        replace: "draft: () => '',",
      },
    ],
    tests: [unit],
  },
  {
    name: 'Backspace takes the last tag while the draft has text',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "model.draft === '' && model.tags.length > 0",
        replace: 'model.tags.length > 0',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal leaves the focus on a button that is gone',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'commands: [',
        replace: 'commands: undefined && [',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal focuses a chip by its bare id',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'Dom.focus(RovingTabindex.idSelector(id))',
        replace: 'Dom.focus(`#${id}`)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal focuses the input whatever chips are left',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'onSome: each => chipId(model.id, each),',
        replace: 'onSome: () => inputId(model.id),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal focuses the chip before it',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'tags[Math.min(at, tags.length - 1)]',
        replace: 'tags[Math.max(0, at - 1)]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a removal leaves the tab stop where it was',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'chip: () => next,',
        replace: 'chip: chip => chip,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every remove button removes the first tag',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'h.OnClick(lift(Message.Removed({ tag })))',
        replace: 'h.OnClick(lift(Message.Removed({ tag: model.tags[0]! })))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Backspace is read from a frame-old draft',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'input.tags.length > 0 && fieldIsEmpty(input)',
        replace: "input.tags.length > 0 && input.draft === ''",
      },
    ],
    tests: [browser],
  },
  {
    name: 'Backspace is taken with text in the input',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'input.tags.length > 0 && fieldIsEmpty(input)',
        replace: 'input.tags.length > 0',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the keys of the application are dropped',
    edits: [{ file: '../src/tagsInput.ts', find: '...(options.routes ?? []),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'every chip is a tab stop',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'h.Tabindex(tag === stop ? 0 : -1)',
        replace: 'h.Tabindex(0)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the tab stop starts on the first chip',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "model.tags.at(-1) ?? ''",
        replace: "model.tags[0] ?? ''",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the tab stop ignores the chip last moved to',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'Option.filter(model.chip, tag => model.tags.includes(tag))',
        replace: 'Option.none()',
      },
    ],
    tests: [unit],
  },
  {
    name: 'focus moved to the same chip is a change',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'Option.getOrNull(chip) === Option.getOrNull(model.chip)',
        replace: 'false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an arrow past the last chip stays on it',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'if (key === forwardKey && at === indices.length - 1) {',
        replace: 'if (false) {',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the chips move by the arrows of a left-to-right page',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '            direction,\n          })',
        replace: "            direction: 'ltr',\n          })",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the way out of the chips ignores the direction',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "const forwardKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'",
        replace: "const forwardKey = 'ArrowRight'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the arrows wrap round the chips',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'loop: false,',
        replace: 'loop: true,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Delete does not remove a chip',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "on: [Behaviors.Keys.chord('Backspace'), Behaviors.Keys.chord('Delete')],",
        replace: "on: [Behaviors.Keys.chord('Backspace')],",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input leaves for the first chip',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'input.tags.at(-1)',
        replace: 'input.tags.at(0)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input leaves from any caret',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'caretAtStart(input)\n',
        replace: 'true\n',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the input leaves with a selection',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'field.selectionStart === 0 && field.selectionEnd === 0',
        replace: 'field.selectionStart === 0',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a chip cannot be found to focus',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'h.Id(chipId(model.id, tag)),\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the input adds nothing when it loses focus',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '...(options.addOnBlur === true ? [h.OnBlur(lift(Message.Committed()))] : []),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input adds its draft on blur unasked',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'options.addOnBlur === true ? [h.OnBlur',
        replace: 'true ? [h.OnBlur',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the remove button ignores the words for its name',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'options.words?.remove?.(tag) ?? ',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the remove button ignores the words for its mark',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: "options.words?.mark ?? '×'",
        replace: "'×'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled field still takes keys',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: '...(disabled ? [] : [keys.mixin]),',
        replace: '...[keys.mixin],',
      },
    ],
    tests: [unit],
  },
]

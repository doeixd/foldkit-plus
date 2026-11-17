/**
 * The shipped Bundles pass their args to `init`, pick the fold their mode
 * needs, and report what the application must fold:
 * `pnpm mutate packages/mixins-ui/test/bundles.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/bundles.test.ts']

export default [
  {
    name: 'a FileUpload starts from every arg',
    edits: [
      {
        file: '../src/bundles/fileUpload.ts',
        find: 'init: args => ({ model: init(args) }),',
        replace: 'init: args => ({ model: init({ id: args.id }) }),',
      },
    ],
    tests,
  },
  {
    name: 'a FileUpload reports what an offer listed',
    edits: [
      {
        file: '../src/bundles/fileUpload.ts',
        find: 'update: (model, message) => update(model, message),',
        replace: 'update: (model, message) => ({ model: update(model, message).model }),',
      },
    ],
    tests,
  },
  {
    name: 'a TagsInput starts from every arg',
    edits: [
      {
        file: '../src/bundles/tagsInput.ts',
        find: 'init: args => ({ model: init(args) }),',
        replace: 'init: args => ({ model: init({ id: args.id }) }),',
      },
    ],
    tests,
  },
  {
    name: 'a multiple Combobox folds with the multiple update',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: 'args.multiple === true ? multiple.update(model, message) : single.update(model, message)',
        replace: 'single.update(model, message)',
      },
    ],
    tests,
  },
  {
    name: 'a Combobox of one folds with the single update',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: 'args.multiple === true ? multiple.update(model, message) : single.update(model, message)',
        replace: 'multiple.update(model, message)',
      },
    ],
    tests,
  },
  {
    name: 'a Combobox reports the text when it changes',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: 'result.model.inputValue === model.inputValue',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a choice is reported before the text that followed it',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: 'Option.map(Option.fromNullishOr(result.outMessage), changeOf),\n      () => typed,',
        replace:
          'typed,\n      () => Option.map(Option.fromNullishOr(result.outMessage), changeOf),',
      },
    ],
    tests,
  },
  {
    name: '`animated` reaches upstream as `isAnimated`',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: '...(animated === undefined ? {} : { isAnimated: animated }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: '`modal` reaches upstream as `isModal`',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: '...(modal === undefined ? {} : { isModal: modal }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the other args reach upstream',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: '      ...rest,\n',
        replace: '      id: rest.id,\n',
      },
    ],
    tests,
  },
  {
    name: 'a Combobox starts blank whatever `text` it was given',
    edits: [
      {
        file: '../src/bundles/combobox.ts',
        find: 'text === undefined ? model : { ...model, inputValue: text }',
        replace: 'model',
      },
    ],
    tests,
  },
]

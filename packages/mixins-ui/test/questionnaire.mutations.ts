/**
 * The questionnaire, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/questionnaire.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = ['packages/mixins-ui/test/questionnaire.test.ts']
const browser = ['packages/mixins-ui/test/questionnaire.browser.test.ts']
const both = [...unit, ...browser]
const view = '../src/questionnaire.ts'
const recipe = '../src/recipes/questionnaire.ts'

export default [
  {
    name: 'two questions may share an id',
    edits: [{ file: view, find: '    if (seen.has(question.id))', replace: '    if (false)' }],
    tests: unit,
  },
  {
    name: 'an answer is read through the prototype',
    edits: [
      {
        file: view,
        find: 'Object.hasOwn(record, key) ? Option.some',
        replace: 'key in record ? Option.some',
      },
    ],
    tests: unit,
  },
  {
    name: 'a radio’s choice keeps the other field’s text',
    edits: [
      {
        file: view,
        find: "answered(next, each, { chosen: [out.value], text: '' })",
        replace:
          'answered(next, each, { chosen: [out.value], text: answerOf(next, question).text })',
      },
    ],
    tests: unit,
  },
  {
    name: 'writing in a single choice’s other field keeps the choice',
    edits: [
      {
        file: view,
        find: "chosen: text.trim() === '' ? answer.chosen : [],",
        replace: 'chosen: answer.chosen,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a box that is no option is checked',
    edits: [
      {
        file: view,
        find: '                if (!options.some(option => option.value === value)) return { model }\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the same text is a change',
    edits: [
      { file: view, find: '          if (answer.text === text) return { model }\n', replace: '' },
    ],
    tests: unit,
  },
  {
    name: 'a single choice with no other field takes text',
    edits: [
      {
        file: view,
        find: '            Single: ({ other }) =>\n              Option.isNone(other)\n                ? { model }',
        replace:
          '            Single: ({ other }) =>\n              false\n                ? { model }',
      },
    ],
    tests: unit,
  },
  {
    name: 'a submit missing an answer moves no focus',
    edits: [
      {
        file: view,
        find: 'commands: [focusQuestion(model, placeOf(model, missing[0]!))],',
        replace: 'commands: [],',
      },
    ],
    tests: both,
  },
  {
    name: 'the answers are sent untrimmed',
    edits: [{ file: view, find: 'text: answer.text.trim() }', replace: 'text: answer.text }' }],
    tests: unit,
  },
  {
    name: 'a sent questionnaire still changes',
    edits: [{ file: view, find: '  if (model.submitted) return { model }\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'Next moves past a missing answer',
    edits: [
      {
        file: view,
        find: '        return missing.length > 0\n          ? {',
        replace: '        return false\n          ? {',
      },
    ],
    tests: unit,
  },
  {
    name: 'a last submit stays on the last page',
    edits: [
      {
        file: view,
        find: "page: page => (model.layout === 'paged' ? placeOf(model, missing[0]!) : page),",
        replace: 'page: page => page,',
      },
    ],
    tests: unit,
  },
  {
    name: 'Back goes before the first page',
    edits: [
      {
        file: view,
        find: "      model.layout === 'paged' && model.page > 0",
        replace: "      model.layout === 'paged' && model.page >= 0",
      },
    ],
    tests: unit,
  },
  {
    name: 'the focus lands on the first radio, not the checked one',
    edits: [
      { file: view, find: ':is([role="radio"][tabindex="0"],', replace: ':is([role="radio"],' },
    ],
    tests: browser,
  },
  {
    name: 'a sent questionnaire leaves the focus where it was',
    edits: [
      {
        file: view,
        find: 'commands: [Focus({ selector: `#${summaryId(model)}` })],',
        replace: 'commands: [],',
      },
    ],
    tests: browser,
  },
  {
    name: 'the summary takes no focus',
    edits: [
      {
        file: view,
        find: 'builders.summary.attrs([h.Id(summaryId(model)), h.Tabindex(-1), ...named])',
        replace: 'builders.summary.attrs([h.Id(summaryId(model)), ...named])',
      },
    ],
    tests: browser,
  },
  {
    name: 'an answer leaves its question marked missing',
    edits: [
      {
        file: view,
        find: 'isAnswered(question, answer) ? missing.filter(id => id !== question.id) : missing,',
        replace: 'missing,',
      },
    ],
    tests: unit,
  },
  {
    name: 'the radios are not named by their question',
    edits: [
      { file: view, find: '                          h.AriaLabelledBy(promptId),\n', replace: '' },
    ],
    tests: unit,
  },
  {
    name: 'a missing single choice is not said',
    edits: [
      {
        file: view,
        find: '...(isMissing ? [h.AriaInvalid(true), h.AriaDescribedBy(errorId)] : []),',
        replace: '...[],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a missing text field is not described',
    edits: [
      {
        file: view,
        find: '        described: more.invalid,',
        replace: '        described: false,',
      },
    ],
    tests: unit,
  },
  {
    name: 'one at a time draws every question',
    edits: [
      { file: view, find: 'place === model.page ? [drawQuestion', replace: 'true ? [drawQuestion' },
    ],
    tests: unit,
  },
  {
    name: 'Back on the first page',
    edits: [
      { file: view, find: '        ...(paged && model.page > 0', replace: '        ...(paged' },
    ],
    tests: unit,
  },
  {
    name: 'the last page says Next',
    edits: [
      {
        file: view,
        find: 'paged && model.page < total - 1',
        replace: 'paged && model.page < total',
      },
    ],
    tests: unit,
  },
  {
    name: 'a blank answer is said as nothing',
    edits: [{ file: view, find: "said === '' ? skipped : said,", replace: 'said,' }],
    tests: unit,
  },
  {
    name: 'no progress one at a time',
    edits: [{ file: view, find: '...(paged && total > 1', replace: '...(false' }],
    tests: unit,
  },
  {
    // Dropped outright, the form would navigate the test page away.
    name: 'sending the form submits nothing',
    edits: [
      {
        file: view,
        find: 'h.OnSubmit(lift(Message.Submitted())),',
        replace: 'h.OnSubmit(lift(Message.CompletedFocus())),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a second Slot on the radio’s row replaces its class',
    edits: [
      {
        file: view,
        find: '                            option.card,\n',
        replace: '                            [...option.card, ...builders.words.attrs()],\n',
      },
    ],
    tests: browser,
  },
  {
    name: 'the buttons sit at the start',
    edits: [{ file: recipe, find: ", justifyContent: 'end' }", replace: ' }' }],
    tests: browser,
  },
  {
    name: 'the start variant leaves them at the end',
    edits: [
      {
        file: recipe,
        find: "      start: { actions: variant(Style.self({ justifyContent: 'start' })) },",
        replace: '      start: {},',
      },
    ],
    tests: browser,
  },
  {
    name: 'what is missing is in the text’s ink',
    edits: [
      {
        file: recipe,
        find: "color: ref.error.ink, ...role('caption')",
        replace: "...role('caption')",
      },
    ],
    tests: browser,
  },
]

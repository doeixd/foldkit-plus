import * as UiRadio from '@foldkit/ui/radioGroup'
import { Effect, Option, Schema } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { view as buttonView, type ButtonSlots } from './button.js'
import { flipped } from './choices.js'
import { view as checkboxGroupView, type CheckboxGroupSlots } from './checkboxGroup.js'
import { view as inputView, type InputSlots } from './input.js'
import { toView as radioToView, type RadioGroupSlots } from './radioGroup.js'
import type { MixinList } from './resolve.js'
import { view as textareaView, type TextareaSlots } from './textarea.js'

/**
 * An assistant asking the reader structured questions in the chat, as
 * Claude Code's and ChatGPT's clarifying questions: a single choice (the
 * package's RadioGroup), a multiple choice (its CheckboxGroup), or free text
 * (its Input or Textarea), each choice question with an optional "Other"
 * field, asked all at once or one at a time, and sent with a submit. The
 * questions, the answers so far and the radio groups' focus are a Model of
 * this module's, which the application keeps and folds with `update`; once
 * every question that must be is answered, the submit comes out as
 * `OutMessage.Answered`, and the form gives way to a summary of the answers.
 * A submit with one missing says so beside it and moves the focus to it, as
 * Next does to the next question. The parts the reused components draw are
 * styled by their own recipes, passed beside this one's style.
 */
export const QuestionnaireSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  /** `Question 2 of 3`, one at a time. */
  progress: Slot.make({ capability: Capability.Container }),
  question: Slot.make({ capability: Capability.Container }),
  /** A single choice's question; the other kinds' are their control's own label. */
  prompt: Slot.make({ capability: Capability.Container }),
  /** A radio's words beside it: its label and its description. */
  words: Slot.make({ capability: Capability.Container }),
  /** A text field's label, control and what is missing, together. */
  field: Slot.make({ capability: Capability.Container }),
  /** The free-text field under a choice question's options. */
  other: Slot.make({ capability: Capability.Container }),
  error: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  /** The answers, once sent, in place of the form. */
  summary: Slot.make({ capability: Capability.Container }),
  asked: Slot.make({ capability: Capability.Container }),
  answer: Slot.make({ capability: Capability.Container }),
})

export const Choice = Schema.Struct({
  value: Schema.String,
  label: Schema.String,
  description: Schema.OptionFromNullOr(Schema.String),
})
export type Choice = typeof Choice.Type

const choiceFields = {
  /** Unique within the questionnaire; the answer's name. */
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(Choice),
  /** The label of a free-text field beside the options, Claude Code's "Other". */
  other: Schema.OptionFromNullOr(Schema.String),
  /** Whether a submit may leave it unanswered. */
  optional: Schema.Boolean,
}

export const Question = defineTaggedUnion({
  /** One of the options, or the other field's text in place of one. */
  Single: choiceFields,
  /** Any of the options, and the other field's text beside them. */
  Multiple: choiceFields,
  Text: {
    id: Schema.String,
    prompt: Schema.String,
    placeholder: Schema.OptionFromNullOr(Schema.String),
    /** A Textarea rather than an Input. */
    multiline: Schema.Boolean,
    optional: Schema.Boolean,
  },
})
export type Question = typeof Question.Type

interface ChoiceInput {
  readonly value: string
  readonly label: string
  readonly description?: string | undefined
}

interface ChoiceQuestionInput {
  readonly id: string
  readonly prompt: string
  readonly options: ReadonlyArray<ChoiceInput>
  readonly other?: string | undefined
  readonly optional?: boolean | undefined
}

const choicesOf = (options: ReadonlyArray<ChoiceInput>): ReadonlyArray<Choice> =>
  options.map(option => ({
    value: option.value,
    label: option.label,
    description: Option.fromUndefinedOr(option.description),
  }))

/** A single-choice question, its omitted fields defaulted. */
export const single = (question: ChoiceQuestionInput): Question =>
  Question.Single({
    id: question.id,
    prompt: question.prompt,
    options: choicesOf(question.options),
    other: Option.fromUndefinedOr(question.other),
    optional: question.optional ?? false,
  })

/** A multiple-choice question, its omitted fields defaulted. */
export const multiple = (question: ChoiceQuestionInput): Question =>
  Question.Multiple({
    id: question.id,
    prompt: question.prompt,
    options: choicesOf(question.options),
    other: Option.fromUndefinedOr(question.other),
    optional: question.optional ?? false,
  })

/** A free-text question, its omitted fields defaulted. */
export const text = (question: {
  readonly id: string
  readonly prompt: string
  readonly placeholder?: string | undefined
  readonly multiline?: boolean | undefined
  readonly optional?: boolean | undefined
}): Question =>
  Question.Text({
    id: question.id,
    prompt: question.prompt,
    placeholder: Option.fromUndefinedOr(question.placeholder),
    multiline: question.multiline ?? false,
    optional: question.optional ?? false,
  })

/** The options chosen and the text written, whatever the question's kind. */
export const Answer = Schema.Struct({ chosen: Schema.Array(Schema.String), text: Schema.String })
export type Answer = typeof Answer.Type

const unanswered: Answer = { chosen: [], text: '' }

export const Layout = Schema.Literals(['all', 'paged'])
export type Layout = typeof Layout.Type

export const Model = Schema.Struct({
  /** Prefixes every id the questionnaire draws, unique on the page. */
  id: Schema.String,
  questions: Schema.Array(Question),
  /** By question id; read with `answerOf`. */
  answers: Schema.Record(Schema.String, Answer),
  /** Each single-choice question's radio group, by question id. */
  radios: Schema.Record(Schema.String, UiRadio.Model),
  /** Every question at once, or one at a time. */
  layout: Layout,
  /** The question shown, one at a time. */
  page: Schema.Number,
  /** The questions the last submit or Next found unanswered. */
  missing: Schema.Array(Schema.String),
  /** Whether the answers have gone. */
  submitted: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotRadio: { question: Schema.String, message: UiRadio.Message },
  Toggled: { question: Schema.String, value: Schema.String },
  Typed: { question: Schema.String, text: Schema.String },
  /** The form was sent: Next, one at a time, short of the last question. */
  Submitted: {},
  Backed: {},
  CompletedFocus: {},
})
export type Message = typeof Message.Type

/** One question's answer, as the submit sends it. */
export const Answered = Schema.Struct({
  question: Schema.String,
  chosen: Schema.Array(Schema.String),
  text: Schema.String,
})

export const OutMessage = defineMessageUnion({
  /** Every answer, in the questions' order; an optional one left blank is empty. */
  Answered: { answers: Schema.Array(Answered) },
})
export type OutMessage = typeof OutMessage.Type

const Radios = UiRadio.create<string>()

// Ids are by the question's place, as a question's own id may hold what a selector cannot.
const questionId = (model: Model, place: number) => `${model.id}-q${place}`
const summaryId = (model: Model) => `${model.id}-summary`

/**
 * A questionnaire, unanswered. Question ids must be unique: an answer is
 * kept by its question's, and a repeat would share it, so it throws.
 */
export const init = (options: {
  readonly id: string
  readonly questions: ReadonlyArray<Question>
  /** Default `all`. */
  readonly layout?: Layout | undefined
}): Model => {
  const seen = new Set<string>()
  for (const question of options.questions) {
    if (seen.has(question.id))
      throw new Error(`Questionnaire.init: two questions have the id "${question.id}"`)
    seen.add(question.id)
  }
  // Defined, not assigned, so an id such as `__proto__` is a key like any other.
  const radios = Object.fromEntries(
    options.questions.flatMap((question, place) =>
      question._tag === 'Single'
        ? [[question.id, UiRadio.init({ id: `${options.id}-q${place}-radio` })] as const]
        : [],
    ),
  )
  return {
    id: options.id,
    questions: options.questions,
    answers: {},
    radios,
    layout: options.layout ?? 'all',
    page: 0,
    missing: [],
    submitted: false,
  }
}

// Own keys only: a question id such as `constructor` would read Object's.
const own = <Value>(record: Readonly<Record<string, Value>>, key: string): Option.Option<Value> =>
  Object.hasOwn(record, key) ? Option.some(record[key]!) : Option.none()

/** The answer to `question` so far. */
export const answerOf = (model: Model, question: string): Answer =>
  Option.getOrElse(own(model.answers, question), () => unanswered)

/** Whether `answer` answers `question`: an option, or text that is not blank. */
export const isAnswered = (question: Question, answer: Answer): boolean => {
  const wrote = answer.text.trim() !== ''
  return Question.match(question, {
    Single: () => answer.chosen.length === 1 || wrote,
    Multiple: () => answer.chosen.length > 0 || wrote,
    Text: () => wrote,
  })
}

const missingOf = (model: Model, questions: ReadonlyArray<Question>): ReadonlyArray<string> =>
  questions.flatMap(question =>
    question.optional || isAnswered(question, answerOf(model, question.id)) ? [] : [question.id],
  )

const Focus = Command.define('FocusQuestion', {
  args: { selector: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

// The question's answer: its checked radio, else its first field or box.
const focusQuestion = (model: Model, place: number) =>
  Focus({
    selector: `#${questionId(model, place)} :is([role="radio"][tabindex="0"], [role="checkbox"], input, textarea)`,
  })

type Return = ReturnWithOutMessage<Model, Message, OutMessage>

const placeOf = (model: Model, question: string): number =>
  model.questions.findIndex(each => each.id === question)

/** Writes `question`'s answer, and clears it from `missing` once it is answered. */
const answered = (model: Model, question: Question, answer: Answer): Model =>
  modifyFields(model, {
    answers: answers => ({ ...answers, [question.id]: answer }),
    missing: missing =>
      isAnswered(question, answer) ? missing.filter(id => id !== question.id) : missing,
  })

const asked = (model: Model, question: string): Option.Option<Question> =>
  Option.fromUndefinedOr(model.questions.find(each => each.id === question))

/** The questionnaire after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return => {
  if (model.submitted) return { model }
  return Message.match(message, {
    GotRadio: ({ question, message: radio }): Return =>
      Option.match(own(model.radios, question), {
        onNone: () => ({ model }),
        onSome: group => {
          const result = Radios.update(group, radio)
          const next = modifyFields(model, {
            radios: radios => ({ ...radios, [question]: result.model }),
          })
          const commands = Command.mapMessages(result.commands, inner =>
            Message.GotRadio({ question, message: inner }),
          )
          return Option.match(
            Option.flatMap(Option.fromNullishOr(result.outMessage), out =>
              Option.map(asked(model, question), each => ({ out, each })),
            ),
            {
              onNone: () => ({ model: next, commands }),
              onSome: ({ out, each }) => ({
                // A choice replaces any text written in the other field.
                model: answered(next, each, { chosen: [out.value], text: '' }),
                commands,
              }),
            },
          )
        },
      }),
    Toggled: ({ question, value }): Return =>
      Option.match(asked(model, question), {
        onNone: () => ({ model }),
        onSome: each =>
          Question.matchOrElse<Return>(
            each,
            {
              Multiple: ({ options }) => {
                if (!options.some(option => option.value === value)) return { model }
                const answer = answerOf(model, question)
                return {
                  model: answered(model, each, {
                    ...answer,
                    chosen: flipped(answer.chosen, value),
                  }),
                }
              },
            },
            () => ({ model }),
          ),
      }),
    Typed: ({ question, text }): Return =>
      Option.match(asked(model, question), {
        onNone: () => ({ model }),
        onSome: each => {
          const answer = answerOf(model, question)
          if (answer.text === text) return { model }
          return Question.match(each, {
            // Writing in a single choice's other field is choosing it.
            Single: ({ other }) =>
              Option.isNone(other)
                ? { model }
                : {
                    model: answered(model, each, {
                      chosen: text.trim() === '' ? answer.chosen : [],
                      text,
                    }),
                  },
            Multiple: ({ other }) =>
              Option.isNone(other)
                ? { model }
                : { model: answered(model, each, { ...answer, text }) },
            Text: () => ({ model: answered(model, each, { ...answer, text }) }),
          })
        },
      }),
    Submitted: (): Return => {
      const last = model.questions.length - 1
      if (model.layout === 'paged' && model.page < last) {
        const shown = model.questions.slice(model.page, model.page + 1)
        const missing = missingOf(model, shown)
        return missing.length > 0
          ? {
              model: modifyFields(model, { missing: () => missing }),
              commands: [focusQuestion(model, model.page)],
            }
          : {
              model: modifyFields(model, { page: page => page + 1, missing: () => [] }),
              commands: [focusQuestion(model, model.page + 1)],
            }
      }
      const missing = missingOf(model, model.questions)
      if (missing.length > 0)
        return {
          model: modifyFields(model, {
            missing: () => missing,
            // One at a time, back to the first unanswered question.
            page: page => (model.layout === 'paged' ? placeOf(model, missing[0]!) : page),
          }),
          commands: [focusQuestion(model, placeOf(model, missing[0]!))],
        }
      return {
        model: modifyFields(model, { submitted: () => true, missing: () => [] }),
        commands: [Focus({ selector: `#${summaryId(model)}` })],
        outMessage: OutMessage.Answered({
          answers: model.questions.map(question => {
            const answer = answerOf(model, question.id)
            return { question: question.id, chosen: answer.chosen, text: answer.text.trim() }
          }),
        }),
      }
    },
    Backed: (): Return =>
      model.layout === 'paged' && model.page > 0
        ? {
            model: modifyFields(model, { page: page => page - 1, missing: () => [] }),
            commands: [focusQuestion(model, model.page - 1)],
          }
        : { model },
    CompletedFocus: (): Return => ({ model }),
  })
}

export interface QuestionnaireView<Message> {
  readonly model: Model
  /** Lifts the questionnaire's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** A heading over the questions, which names the form. */
  readonly title?: string | undefined
  /** Default `Submit`. */
  readonly submitLabel?: string | undefined
  /** Default `Next`. */
  readonly nextLabel?: string | undefined
  /** Default `Back`. */
  readonly backLabel?: string | undefined
  /** Said beside a question a submit found unanswered; default `Answer this question`. */
  readonly missingText?: string | undefined
  /** Said in the summary for an optional question left blank; default `Skipped`. */
  readonly skippedText?: string | undefined
  /** One at a time, where the reader is; default `Question 2 of 3`. */
  readonly progressText?: ((page: number, total: number) => string) | undefined
  /** A style of `QuestionnaireSlots`, for the questionnaire's own parts. */
  readonly style?: NamedStyle<typeof QuestionnaireSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
  /** The single choices' look. */
  readonly radioGroup?: NamedStyle<typeof RadioGroupSlots> | undefined
  /** The multiple choices' look. */
  readonly checkboxGroup?: NamedStyle<typeof CheckboxGroupSlots> | undefined
  /** The one-line answers' and the other fields' look. */
  readonly input?: NamedStyle<typeof InputSlots> | undefined
  /** The multi-line answers' look. */
  readonly textarea?: NamedStyle<typeof TextareaSlots> | undefined
  /** Back's look. */
  readonly button?: NamedStyle<typeof ButtonSlots> | undefined
  /** Next's and Submit's look. */
  readonly submitButton?: NamedStyle<typeof ButtonSlots> | undefined
}

const mixinOf = <Slots>(style: NamedStyle<Slots> | undefined) =>
  style === undefined ? [] : [style.mixin]

/** The labels of the options `answer` chose, in the options' order. */
const labelsOf = (choices: ReadonlyArray<Choice>, answer: Answer): ReadonlyArray<string> => {
  const chosen = new Set(answer.chosen)
  return choices.filter(choice => chosen.has(choice.value)).map(choice => choice.label)
}

export const view = <Outer>(options: QuestionnaireView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    QuestionnaireSlots,
    [...mixinOf(options.style), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model } = options
  const lift = options.onMessage
  const titleId = `${model.id}-title`
  const named = options.title === undefined ? [] : [h.AriaLabelledBy(titleId)]
  const title =
    options.title === undefined ? [] : [h.p(builders.title.attrs([h.Id(titleId)]), [options.title])]

  if (model.submitted) {
    const skipped = options.skippedText ?? 'Skipped'
    return h.div(builders.root.attrs([h.DataAttribute('state', 'answered')]), [
      ...title,
      h.dl(
        builders.summary.attrs([h.Id(summaryId(model)), h.Tabindex(-1), ...named]),
        model.questions.flatMap(question => {
          const answer = answerOf(model, question.id)
          const written = answer.text.trim()
          const said = [
            ...Question.match(question, {
              Single: ({ options: choices }) => labelsOf(choices, answer),
              Multiple: ({ options: choices }) => labelsOf(choices, answer),
              Text: () => [],
            }),
            ...(written === '' ? [] : [written]),
          ].join(', ')
          return [
            h.dt(builders.asked.attrs(), [question.prompt]),
            h.dd(builders.answer.attrs([h.DataAttribute('skipped', String(said === ''))]), [
              said === '' ? skipped : said,
            ]),
          ]
        }),
      ),
    ])
  }

  const missing = new Set(model.missing)
  const missingText = options.missingText ?? 'Answer this question'
  const errorOf = (id: string) => h.p(builders.error.attrs([h.Id(id)]), [missingText])

  // A one-line field, its label above it.
  const line = (
    field: { readonly id: string; readonly value: string; readonly question: string },
    label: string,
    more: { readonly invalid?: boolean; readonly placeholder?: string | undefined },
    after: ReadonlyArray<Html>,
  ) =>
    inputView(
      {
        id: field.id,
        value: field.value,
        onInput: typed => lift(Message.Typed({ question: field.question, text: typed })),
        invalid: more.invalid,
        described: more.invalid,
        placeholder: more.placeholder,
        style: options.input,
        draw: (resolved, h) =>
          h.div(builders.field.attrs(), [
            h.label(resolved.label, [label]),
            h.input(resolved.input),
            ...after,
          ]),
      },
      h,
    )

  const otherField = (question: Question, other: Option.Option<string>, id: string) =>
    Option.match(other, {
      onNone: () => [],
      onSome: label => [
        h.div(builders.other.attrs(), [
          line(
            { id: `${id}-other`, value: answerOf(model, question.id).text, question: question.id },
            label,
            {},
            [],
          ),
        ]),
      ],
    })

  const drawQuestion = (question: Question, place: number): Html => {
    const id = questionId(model, place)
    const isMissing = missing.has(question.id)
    const answer = answerOf(model, question.id)
    const errorId = `${id}-error`
    const body = Question.match(question, {
      Single: ({ options: choices, other, prompt }) => {
        const promptId = `${id}-prompt`
        return [
          h.p(builders.prompt.attrs([h.Id(promptId)]), [prompt]),
          ...Option.match(own(model.radios, question.id), {
            onNone: () => [],
            onSome: group => [
              h.submodel({
                slotId: `${id}-radio`,
                model: group,
                view: Radios.view,
                viewInputs: {
                  options: choices.map(choice => choice.value),
                  selectedValue: Option.fromUndefinedOr(answer.chosen[0]),
                  ariaLabel: prompt,
                  hasOptionDescription: (_, at) => Option.isSome(choices[at]!.description),
                  toView: radioToView<string, Outer>(
                    mixinOf(options.radioGroup),
                    { h },
                    ({ group: attrs, options: drawn }) =>
                      h.div(
                        [
                          ...attrs,
                          h.AriaLabelledBy(promptId),
                          ...(isMissing ? [h.AriaInvalid(true), h.AriaDescribedBy(errorId)] : []),
                        ],
                        // Upstream's options are the choices, in their order.
                        drawn.map((option, at) => {
                          const choice = choices[at]!
                          return h.label(
                            // The RadioGroup's own row: a second Slot's class here would replace its.
                            option.card,
                            [
                              h.button(option.option, []),
                              h.span(builders.words.attrs(), [
                                h.span(option.label, [choice.label]),
                                ...Option.match(choice.description, {
                                  onNone: () => [],
                                  onSome: description => [
                                    h.span(option.description, [description]),
                                  ],
                                }),
                              ]),
                            ],
                          )
                        }),
                      ),
                  ),
                },
                toParentMessage: inner =>
                  lift(Message.GotRadio({ question: question.id, message: inner })),
              }),
            ],
          }),
          ...otherField(question, other, id),
          ...(isMissing ? [errorOf(errorId)] : []),
        ]
      },
      Multiple: ({ options: choices, other, prompt }) => [
        checkboxGroupView(
          {
            id: `${id}-boxes`,
            legend: prompt,
            options: choices.map(choice => ({
              value: choice.value,
              label: choice.label,
              description: Option.getOrUndefined(choice.description),
            })),
            checked: answer.chosen,
            onToggle: value => lift(Message.Toggled({ question: question.id, value })),
            error: isMissing ? missingText : undefined,
            style: options.checkboxGroup,
          },
          h,
        ),
        ...otherField(question, other, id),
      ],
      Text: ({ prompt, placeholder, multiline }) => {
        const fieldId = `${id}-text`
        // At upstream's description id, which `described` points the field at.
        const error = isMissing ? [errorOf(`${fieldId}-description`)] : []
        const field = { id: fieldId, value: answer.text, question: question.id }
        return [
          multiline
            ? textareaView(
                {
                  id: fieldId,
                  value: answer.text,
                  onInput: typed => lift(Message.Typed({ question: question.id, text: typed })),
                  invalid: isMissing,
                  described: isMissing,
                  placeholder: Option.getOrUndefined(placeholder),
                  style: options.textarea,
                  draw: (resolved, h) =>
                    h.div(builders.field.attrs(), [
                      h.label(resolved.label, [prompt]),
                      h.textarea(resolved.textarea),
                      ...error,
                    ]),
                },
                h,
              )
            : line(
                field,
                prompt,
                { invalid: isMissing, placeholder: Option.getOrUndefined(placeholder) },
                error,
              ),
        ]
      },
    })
    return h.keyed('div')(
      question.id,
      builders.question.attrs([h.Id(id), h.DataAttribute('missing', String(isMissing))]),
      body,
    )
  }

  const paged = model.layout === 'paged'
  const total = model.questions.length
  const progressText =
    options.progressText ?? ((page: number, of: number) => `Question ${page + 1} of ${of}`)
  return h.form(
    builders.root.attrs([
      h.DataAttribute('state', 'asking'),
      h.OnSubmit(lift(Message.Submitted())),
      ...named,
    ]),
    [
      ...title,
      ...(paged && total > 1
        ? [h.p(builders.progress.attrs(), [progressText(model.page, total)])]
        : []),
      ...(paged
        ? model.questions.flatMap((question, place) =>
            place === model.page ? [drawQuestion(question, place)] : [],
          )
        : model.questions.map((question, place) => drawQuestion(question, place))),
      h.div(builders.actions.attrs(), [
        ...(paged && model.page > 0
          ? [
              buttonView(
                {
                  label: options.backLabel ?? 'Back',
                  type: 'button',
                  onClick: lift(Message.Backed()),
                  style: options.button,
                },
                h,
              ),
            ]
          : []),
        buttonView(
          {
            label:
              paged && model.page < total - 1
                ? (options.nextLabel ?? 'Next')
                : (options.submitLabel ?? 'Submit'),
            type: 'submit',
            style: options.submitButton,
          },
          h,
        ),
      ]),
    ],
  )
}

/**
 * The Form section as an island: fields, toggles, attachments and topic chips.
 */
import { Schema } from 'effect'
import { File, Runtime, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { FileDrop as UiFileDrop } from '@foldkit/ui'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiSwitch from '@foldkit/ui/switch'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { Button, Checkbox, FileDrop, Input, TagsInput, Switch, Textarea } from 'foldkit-mixins-ui'
import {
  AreaStyle,
  CheckStyle,
  FieldStyle,
  FilledFieldStyle,
  FileDropStyle,
  FileTextStyle,
  GhostButtonStyle,
  PageStyle,
  TagsStyle,
  ToggleStyle,
} from '../style.js'
import { FileTextSlots, PageSlots } from '../slots.js'
import { foldsFor } from '../fold.js'

export const Model = Schema.Struct({
  name: Schema.String,
  bio: Schema.String,
  marketing: Schema.Boolean,
  notifications: Schema.Boolean,
  drop: UiFileDrop.Model,
  files: Schema.Array(File.File),
  topics: TagsInput.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  NameTyped: { value: Schema.String },
  BioTyped: { value: Schema.String },
  MarketingToggled: { value: Schema.Boolean },
  NotificationsToggled: { value: Schema.Boolean },
  DropFiles: { message: UiFileDrop.Message },
  RemoveFile: { index: Schema.Number },
  GotTopics: { message: TagsInput.Message },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  name: '',
  bio: '',
  marketing: true,
  notifications: false,
  drop: UiFileDrop.init({ id: 'attachments' }),
  files: [],
  topics: TagsInput.init({ id: 'topics', tags: ['design', 'tokens'], max: 6 }),
})

const own = foldsFor<Model, Message>()

type PageBuilders = SlotBuilders<typeof PageSlots, Message>
const foldDropFiles = Update.foldChild({
  ...own('drop', Message.DropFiles),
  update: UiFileDrop.update,
  foldOutMessage: UiFileDrop.OutMessage.match<Update.Step<Model, Message>>({
    ReceivedFiles:
      ({ files }) =>
      model => ({
        model: modifyFields(model, { files: current => [...current, ...files] }),
      }),
    RejectedNonFiles: () => model => ({ model }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    NameTyped: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    BioTyped: ({ value }) => ({ model: modifyFields(model, { bio: () => value }) }),
    MarketingToggled: ({ value }) => ({ model: modifyFields(model, { marketing: () => value }) }),
    NotificationsToggled: ({ value }) => ({
      model: modifyFields(model, { notifications: () => value }),
    }),
    DropFiles: ({ message }) => foldDropFiles(model, message),
    RemoveFile: ({ index }) => ({
      model: modifyFields(model, { files: files => files.filter((_, at) => at !== index) }),
    }),
    GotTopics: ({ message }) => {
      const result = TagsInput.update(model.topics, message)
      const commands = Command.mapMessages(result.commands, message =>
        Message.GotTopics({ message }),
      )
      return result.model === model.topics
        ? { model, commands }
        : { model: modifyFields(model, { topics: () => result.model }), commands }
    },
  })

const formatFileSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/** An attachment drop zone with the files it collected. */
const FileDropDemo = (
  model: Pick<Model, 'drop' | 'files'>,
  slots: PageBuilders,
  h: HtmlBuilder<Message>,
): Html => {
  const text = SlotView.buildersFor(FileTextSlots, [FileTextStyle.style.mixin], { input: model, h })
  return h.div(
    [],
    [
      h.submodel({
        slotId: model.drop.id,
        model: model.drop,
        view: UiFileDrop.view,
        viewInputs: {
          multiple: true,
          toView: attributes => {
            const resolved = FileDrop.resolve(attributes, [FileDropStyle.mixin], { h })
            return h.label(resolved.root, [
              h.p(text.primary.attrs(), ['Drop files or click to browse']),
              h.p(text.secondary.attrs(), [
                model.files.length === 0
                  ? 'Any file type. This demo just lists them.'
                  : `${model.files.length} attached.`,
              ]),
              h.input(resolved.input),
            ])
          },
        },
        toParentMessage: message => Message.DropFiles({ message }),
      }),
      ...model.files.map((file, index) =>
        h.div(slots.row.attrs([h.Key(`${File.name(file)}:${File.size(file)}`)]), [
          h.span(text.fileName.attrs(), [
            `${File.name(file)} (${formatFileSize(File.size(file))})`,
          ]),
          Button.view(
            {
              label: 'Remove',
              style: GhostButtonStyle,
              onClick: Message.RemoveFile({ index }),
            },
            h,
          ),
        ]),
      ),
    ],
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'Input, Textarea, Checkbox, and Switch, each a headless component resolved through its slot contract — plus a drop zone for attachments.',
    ]),
    Input.view(
      {
        id: 'name',
        value: model.name,
        onInput: (value: string) => Message.NameTyped({ value }),
        placeholder: 'Ada Lovelace',
        style: FieldStyle,
        described: true,
        draw: (resolved, h) =>
          h.div(
            [],
            [
              h.label(resolved.label, ['Name']),
              h.input(resolved.input),
              h.span(resolved.description, [`Hello${model.name === '' ? '' : `, ${model.name}`}.`]),
            ],
          ),
      },
      h,
    ),
    Input.view(
      {
        id: 'slug',
        value: 'design-system',
        placeholder: 'slug',
        style: FilledFieldStyle,
        draw: (resolved, h) =>
          h.div(
            [],
            [h.label(resolved.label, ['Slug (filled, read-only)']), h.input(resolved.input)],
          ),
      },
      h,
    ),
    Textarea.view(
      {
        id: 'bio',
        value: model.bio,
        onInput: (value: string) => Message.BioTyped({ value }),
        placeholder: 'What is this space for?',
        rows: 3,
        style: AreaStyle,
        draw: (resolved, h) =>
          h.div([], [h.label(resolved.label, ['Bio']), h.textarea(resolved.textarea)]),
      },
      h,
    ),
    TagsInput.view(
      {
        model: model.topics,
        onMessage: message => Message.GotTopics({ message }),
        label: 'Topics',
        placeholder: 'Add a topic',
        addOnBlur: true,
        style: TagsStyle,
      },
      h,
    ),
    UiCheckbox.view(
      {
        id: 'marketing',
        isChecked: model.marketing,
        onToggle: (value: boolean) => Message.MarketingToggled({ value }),
        toView: Checkbox.toView([CheckStyle.mixin], { h }, resolved =>
          h.div(slots.row.attrs(), [
            h.button(resolved.checkbox, []),
            h.label(resolved.label, ['Marketing emails']),
            h.span(resolved.description, ['Product news, monthly.']),
          ]),
        ),
      },
      h,
    ),
    UiSwitch.view(
      {
        id: 'notifications',
        isChecked: model.notifications,
        onToggle: (value: boolean) => Message.NotificationsToggled({ value }),
        toView: Switch.toView([ToggleStyle.mixin], { h }, resolved =>
          h.div(slots.row.attrs(), [
            h.button(resolved.button, []),
            h.label(resolved.label, ['Email notifications']),
            h.span(resolved.description, [model.notifications ? 'On: digests on Monday.' : 'Off.']),
          ]),
        ),
      },
      h,
    ),
    FileDropDemo(model, slots, h),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}

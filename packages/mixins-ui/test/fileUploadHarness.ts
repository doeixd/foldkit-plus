/**
 * A page around one FileUpload, for the browser tests and the reference
 * examples: the widget in the application's Model, its Commands lifted, its
 * Out Messages and its lanes' Subscriptions wired as an application wires them.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Layers, Style, type NamedStyle } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { FileUpload } from '../src/index.js'

export const Msg = defineMessageUnion({ GotUpload: { message: FileUpload.Message } })
export type Msg = typeof Msg.Type

export const Model = Schema.Struct({ upload: FileUpload.Model })
export type Model = typeof Model.Type

export const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

export type Send = (job: FileUpload.Job) => Stream.Stream<Msg>

export interface Harness {
  readonly init: FileUpload.InitOptions
  readonly render: (
    model: FileUpload.Model,
    lift: (message: FileUpload.Message) => Msg,
    h: HtmlBuilder<Msg>,
  ) => Html
  /** Styles whose CSS joins the page's sheet. */
  readonly styles: ReadonlyArray<NamedStyle<any>>
  readonly send?: Send | undefined
  readonly onOut?: ((out: FileUpload.OutMessage) => void) | undefined
  /** Draws around the widget, e.g. a form and buttons for focus. */
  readonly page?: ((widget: Html, h: HtmlBuilder<Msg>) => Html) | undefined
  readonly extraCss?: string | undefined
}

const lift = (message: FileUpload.Message): Msg => Msg.GotUpload({ message })

export const mount = (harness: Harness) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    harness.styles.map(style => style.css).join('\n') +
    (harness.extraCss ?? '')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'upload-browser'
  document.body.append(container)
  const lanes = harness.init.lanes ?? 0
  const send = harness.send
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { upload: FileUpload.init(harness.init) } }),
      update: (model: Model, message: Msg): Return<Model, Msg> =>
        Msg.match(message, {
          GotUpload: ({ message: inner }) => {
            const { model: upload, commands, outMessage } = FileUpload.update(model.upload, inner)
            if (outMessage !== undefined) harness.onOut?.(outMessage)
            return {
              model:
                upload === model.upload ? model : modifyFields(model, { upload: () => upload }),
              commands: Command.mapMessages(commands ?? [], lift),
            }
          },
        }),
      view: (model: Model, h: HtmlBuilder<Msg>) => {
        const widget = harness.render(model.upload, lift, h)
        return harness.page === undefined ? widget : harness.page(widget, h)
      },
      ...(send === undefined || lanes === 0
        ? {}
        : {
            subscriptions: FileUpload.lanes<Model, Msg>({
              count: lanes,
              model: (parent: Model) => parent.upload,
              send,
            }),
          }),
    }),
  )
}

/**
 * A send the test drives: it records each job started and each one ended (its
 * stream interrupted, which is what aborts a real request), and answers
 * only when told.
 */
export const controlled = () => {
  const started: Array<FileUpload.Job> = []
  const ended: Array<string> = []
  const answers = new Map<string, (message: FileUpload.Message) => void>()
  const send: Send = job =>
    Stream.callback<Msg>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          started.push(job)
          answers.set(job.id, message => Queue.offerUnsafe(queue, lift(message)))
        }),
        () =>
          Effect.sync(() => {
            ended.push(job.id)
            answers.delete(job.id)
          }),
      ),
    )
  const answer = (job: FileUpload.Job, build: (job: FileUpload.Job) => FileUpload.Message) =>
    answers.get(job.id)?.(build(job))
  return {
    send,
    started,
    ended,
    progress: (job: FileUpload.Job, loaded: number, total: number) =>
      answer(job, ({ id, attempt }) =>
        FileUpload.Message.Progressed({ id, attempt, loaded, total }),
      ),
    succeed: (job: FileUpload.Job, url: Option.Option<string> = Option.none()) =>
      answer(job, ({ id, attempt }) => FileUpload.Message.Succeeded({ id, attempt, url })),
    fail: (job: FileUpload.Job, retryable = true) =>
      answer(job, ({ id, attempt }) =>
        FileUpload.Message.Failed({ id, attempt, reason: 'offline', retryable }),
      ),
  }
}

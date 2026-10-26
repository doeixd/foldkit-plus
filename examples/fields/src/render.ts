/**
 * A page per recipe, rendered on the server: what `demo.ts` says, beside the
 * control the form draws filled with the stored value, through the recipes'
 * plain renderers. A page is markup with no script: what a browser shows before
 * any runtime starts.
 */
import { Effect } from 'effect'
import { renderers } from 'foldkit-form-recipes/html'
import { FormView } from 'foldkit-mixins-form'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { describe } from './demo.js'
import type { Reading } from './read.js'

const template = (title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><div id="root"></div></body></html>`

const serve = <Model, Message>(
  title: string,
  model: Model,
  body: (model: Model, h: HtmlBuilder<Message>) => Html,
) =>
  renderToString(
    {
      init: () => ({ model }),
      view: (model: Model, h: HtmlBuilder<Message>) => ({ title, body: body(model, h) }),
    },
    { buildId: 'fields' },
  ).pipe(Effect.map(html => injectIntoTemplate(template(title), html)))

/** One recipe's page: its facts as the demo states them, and its control. */
export const page = (reading: Reading) => {
  const { form } = reading
  type Model = typeof form.initial
  type Message = typeof form.Message.Type
  const View = FormView.define(form, { renderers: renderers() })
  const [heading, ...facts] = describe(reading)
  return serve(reading.entry.name, reading.filled as Model, (model, h: HtmlBuilder<Message>) =>
    h.main(
      [],
      [
        h.h1([], [reading.entry.name]),
        h.p([], [h.a([h.Href('./index.html')], ['Every recipe'])]),
        h.pre([], [heading ?? '', '\n', ...facts.map(line => `${line.trim()}\n`)]),
        h.h2([], ['What can go wrong']),
        h.ul(
          [],
          reading.entry.failures.map(failure => h.li([], [failure])),
        ),
        h.h2([], ['The control, filled']),
        View({ model, errors: [], canSubmit: true }, h),
      ],
    ),
  )
}

/** The list of every page. */
export const index = (readings: ReadonlyArray<Reading>) =>
  serve('Field recipes', null, (_, h: HtmlBuilder<never>) =>
    h.main(
      [],
      [
        h.h1([], ['Field recipes']),
        h.ul(
          [],
          readings.map(({ entry }) =>
            h.li([], [h.a([h.Href(`./${entry.name}.html`)], [entry.name]), ` — ${entry.call}`]),
          ),
        ),
      ],
    ),
  )

/** Every page by its file name, the index first. */
export const pages = (readings: ReadonlyArray<Reading>) =>
  Effect.all([
    Effect.map(index(readings), html => ['index.html', html] as const),
    ...readings.map(reading =>
      Effect.map(page(reading), html => [`${reading.entry.name}.html`, html] as const),
    ),
  ])

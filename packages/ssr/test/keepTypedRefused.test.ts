/**
 * #356 on the server: `KeepTyped` on a field the page cannot replay is
 * refused, naming the element, before anything is served.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Resume, SSR, type ResumableBuilder } from 'foldkit-ssr'
import { config, Message, plan, type Model } from './keepTypedFixture.js'

const rendering = (field: (rh: ResumableBuilder<Message>) => unknown) =>
  Effect.runPromise(
    Effect.flip(
      SSR.render(
        {
          ...config,
          view: (_model: Model, h: HtmlBuilder<Message>) => {
            const rh = Resume.builder(h)
            return { title: 'Search', body: rh.main([], [field(rh) as never]) }
          },
        },
        plan(),
        { buildId: 'b' },
      ),
    ),
  )

describe('KeepTyped is refused', () => {
  it.each([
    {
      on: 'a closure OnInput',
      field: (rh: ResumableBuilder<Message>) =>
        rh.input([
          rh.Id('q'),
          rh.OnInput(value => Message.ChangedQuery({ value })),
          rh.KeepTyped(),
        ]),
      names: 'input#q, which has no OnInput or OnChange given a Message member',
    },
    {
      on: 'a field with no binding',
      field: (rh: ResumableBuilder<Message>) => rh.textarea([rh.Id('q'), rh.KeepTyped()]),
      names: 'textarea#q, which has no OnInput or OnChange',
    },
    {
      on: 'a checkbox',
      field: (rh: ResumableBuilder<Message>) =>
        rh.input([
          rh.Id('q'),
          rh.Type('checkbox'),
          rh.OnChange(Message.ChangedQuery),
          rh.KeepTyped(),
        ]),
      names: 'input#q of type checkbox, which holds no typed value',
    },
    {
      on: 'an element that is no field',
      field: (rh: ResumableBuilder<Message>) =>
        rh.div([rh.Id('q'), rh.OnInput(Message.ChangedQuery), rh.KeepTyped()], []),
      names: 'div#q, which holds no typed value',
    },
  ])('on $on', async ({ field, names }) => {
    const error = await rendering(field)
    expect(error).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'UnkeepableField' })
    expect(error.message).toContain(`KeepTyped on ${names}`)
  })

  it('but not on a text field with its OnChange', async () => {
    const page = await Effect.runPromise(
      SSR.render(
        {
          ...config,
          view: (model: Model, h: HtmlBuilder<Message>) => {
            const rh = Resume.builder(h)
            return {
              title: 'Search',
              body: rh.main(
                [],
                [
                  rh.input([
                    rh.Type('search'),
                    rh.Value(model.query),
                    rh.OnChange(Message.ChangedQuery),
                    rh.KeepTyped(),
                  ]),
                ],
              ),
            }
          },
        },
        plan(),
        { buildId: 'b' },
      ),
    )
    expect(page.rendered.html).toContain('data-foldkit-plus-keep="0"')
  })
})

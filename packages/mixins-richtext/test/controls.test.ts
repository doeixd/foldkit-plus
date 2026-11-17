// @vitest-environment jsdom
/**
 * Every piece whose controls act on the editor's selection marks its root as the editor's controls
 * (`CONTROLS_ATTRIBUTE`), which is what keeps a press on one from taking the focus out of the
 * text. Rendered as a server renders them and parsed back, so the attribute is in the markup.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as RichText from 'foldkit-richtext'
import { CONTROLS_ATTRIBUTE } from 'foldkit-richtext-dom/toolbar'
import { expect, test } from 'vitest'
import {
  blockStyleMenu,
  blockStyles,
  codeToolbar,
  linkEditor,
  markToolbar,
  slashEntries,
  slashMenuView,
  tableToolbar,
} from '../src/index.js'
import { Message, Toolbar, base, document as content } from './formatting.js'

const wrap = (): Message => Message.Picked({ what: 'edit' })
const picked = Message.Picked({ what: 'pick' })
const state = { document: content, selection: base.selection, storedMarks: null }
const entries = slashEntries(wrap)

const pieces: Readonly<Record<string, (h: HtmlBuilder<Message>) => Html>> = {
  formatting: h => Toolbar(base, h),
  marks: h => markToolbar<Message>()({ state, toggled: () => picked }, h),
  styles: h => blockStyles<Message>()({ ...state, wrap }, h),
  styleMenu: h => blockStyleMenu<Message>()({ ...state, wrap, open: true, toggled: picked }, h),
  table: h => tableToolbar<Message>()({ ...state, wrap }, h),
  code: h =>
    codeToolbar<Message>()(
      { document: content, node: RichText.NodeId.make('p'), languages: [], wrap, copied: picked },
      h,
    ),
  slash: h => slashMenuView<Message>()({ entries, textBefore: '/', index: 0 }, h),
  link: h => linkEditor<Message>()({ ...state, draft: '', drafted: () => picked, wrap }, h),
}

const served = () =>
  Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: object, h: HtmlBuilder<Message>) => ({
          title: 'Pieces',
          body: h.div(
            [],
            Object.entries(pieces).map(([name, draw]) => h.section([h.Id(name)], [draw(h)])),
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )

test('each piece that acts on the selection marks its root as the editor’s controls', async () => {
  const page = new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      await served(),
    ),
    'text/html',
  )
  const marked = Object.keys(pieces).filter(
    name => page.querySelector(`#${name} > [${CONTROLS_ATTRIBUTE}]`) !== null,
  )
  expect(marked).toEqual(Object.keys(pieces))
})

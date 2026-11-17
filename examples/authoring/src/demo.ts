/**
 * A text trace of each section's `update`, with no page: what a Message does to
 * the Model, and what the views draw for it. `main.ts` prints it.
 */
import { Option } from 'effect'
import { runDemo as runSwipeDemo } from './swipe/demo.js'
import { runDemo as runStepperDemo } from './stepper/demo.js'
import { runDemo as runSpatialDemo } from './spatial/demo.js'
import { runDemo as runInlineEditDemo } from './inline-edit/demo.js'
import { runDemo as runHotkeysDemo } from './hotkeys/demo.js'
import { runDemo as runGridDemo } from './grid/demo.js'
import { runDemo as runBoxDemo } from './box/demo.js'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Reorder } from 'foldkit-primitives/interaction'
import {
  Message as ListMessage,
  Rows,
  initial as listInitial,
  update as listUpdate,
} from './list/app.js'
import {
  Message as PopupMessage,
  initialOf as popupInitial,
  labelOf,
  update as popupUpdate,
} from './popup/app.js'
import {
  Message as SearchMessage,
  initialOf as searchInitial,
  resultId,
  resultsOf,
  update as searchUpdate,
} from './search/app.js'
import { SearchField } from './search/view.js'

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []

  let search = searchInitial('search').model
  lines.push(`search: results=${resultsOf(search).length}`)
  search = searchUpdate(search, SearchMessage.Typed({ text: 'ap' })).model
  lines.push(`search typed ap: ${resultsOf(search).join(', ')}`)
  const options = Inert.byRole(Inert.draw(SearchField, search), 'option')
  lines.push(`search draws ${options.length} options`)
  search = searchUpdate(search, SearchMessage.Picked({ id: resultId('search', 'apricot') })).model
  lines.push(`search picked: query=${search.query} results=${resultsOf(search).length}`)
  lines.push(
    `search attachments: ${SlotView.describe(SearchField)
      .attachments.map(attachment => attachment.name)
      .join(', ')}`,
  )

  let popup = popupInitial('popup').model
  lines.push(`popup: ${labelOf(popup)}`)
  popup = popupUpdate(popup, PopupMessage.Opened()).model
  lines.push(`popup opened: open=${popup.open}`)
  const refused = popupUpdate(popup, PopupMessage.Picked({ id: 'popup:daily' })).model
  lines.push(`popup daily is disabled: unchanged=${refused === popup}`)
  popup = popupUpdate(popup, PopupMessage.Picked({ id: 'popup:weekly' })).model
  lines.push(`popup picked: ${labelOf(popup)} open=${popup.open}`)

  let list = listInitial().model
  lines.push(`list: ${list.items.map(item => item.title).join(' | ')}`)
  list = listUpdate(
    list,
    Rows.wrapper.make(Reorder.Message.Grabbed({ id: 'item-1', by: 'pointer', at: Option.none() })),
  ).model
  list = listUpdate(
    list,
    Rows.wrapper.make(
      Reorder.Message.Released({ over: Option.some({ id: 'item-3', zone: 'after' as const }) }),
    ),
  ).model
  lines.push(
    `list after dropping the first row last: ${list.items.map(item => item.title).join(' | ')}`,
  )
  list = listUpdate(list, ListMessage.Added()).model
  lines.push(`list added: ${list.items.length} rows`)

  for (const run of [
    runInlineEditDemo,
    runSpatialDemo,
    runBoxDemo,
    runStepperDemo,
    runSwipeDemo,
    runGridDemo,
    runHotkeysDemo,
  ])
    lines.push(...run())

  return lines
}

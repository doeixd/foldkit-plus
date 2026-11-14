/**
 * What each section's `update` decides, with no page: the field of the model a
 * Message changes, and the Model it hands back when nothing changes.
 */
import { Effect, Option } from 'effect'
import { Motion, PresenceMessage } from 'foldkit-primitives/motion'
import { Reorder } from 'foldkit-primitives/interaction'
import { describe, expect, it } from 'vitest'
import {
  GotPresence,
  Message as ListMessage,
  Rows,
  initial as listInitial,
  update as listUpdate,
} from '../src/list/app.js'
import {
  Message as PopupMessage,
  initialOf as popupInitial,
  labelOf,
  update as popupUpdate,
} from '../src/popup/app.js'
import {
  Message as SearchMessage,
  fruitOf,
  initialOf as searchInitial,
  resultId,
  resultsOf,
  update as searchUpdate,
} from '../src/search/app.js'

describe('the search field', () => {
  const start = searchInitial('s').model

  it('lists nothing for an empty query, the matches for a typed one, and nothing once one is picked', () => {
    expect(resultsOf(start)).toEqual([])
    const typed = searchUpdate(start, SearchMessage.Typed({ text: ' AP ' })).model
    expect(resultsOf(typed)).toEqual(['apple', 'apricot'])
    const picked = searchUpdate(typed, SearchMessage.Picked({ id: resultId('s', 'apple') })).model
    expect(picked.query).toBe('apple')
    expect(Option.getOrNull(picked.picked)).toBe('apple')
    expect(resultsOf(picked)).toEqual([])
  })

  it('names an id with the instance first, whatever the fruit or the instance holds', () => {
    expect(fruitOf('a:b', resultId('a:b', 'apple'))).toBe('apple')
    expect(fruitOf('search-a', resultId('search-a', 'blueberry'))).toBe('blueberry')
  })

  it('refuses a result that names no fruit, and returns the Model it was given when nothing changes', () => {
    const typed = searchUpdate(start, SearchMessage.Typed({ text: 'ap' })).model
    expect(searchUpdate(typed, SearchMessage.Picked({ id: 's:granite' })).model).toBe(typed)
    expect(searchUpdate(typed, SearchMessage.Typed({ text: 'ap' })).model).toBe(typed)
    expect(searchUpdate(start, SearchMessage.Cleared()).model).toBe(start)
  })

  it('clears the query and the pick, and typing again takes the pick back', () => {
    const picked = searchUpdate(start, SearchMessage.Picked({ id: resultId('s', 'cherry') })).model
    expect(searchUpdate(picked, SearchMessage.Cleared()).model).toMatchObject({
      query: '',
      picked: Option.none(),
    })
    expect(searchUpdate(picked, SearchMessage.Typed({ text: 'ch' })).model.picked).toEqual(
      Option.none(),
    )
  })
})

describe('the popup', () => {
  const start = popupInitial('p').model
  const open = popupUpdate(start, PopupMessage.Opened()).model

  it('opens once, and a second open is the Model it was given', () => {
    expect(open.open).toBe(true)
    expect(popupUpdate(open, PopupMessage.Opened()).model).toBe(open)
  })

  it('chooses and closes on a pick, and says what it chose', () => {
    const picked = popupUpdate(open, PopupMessage.Picked({ id: 'p:weekly' })).model
    expect(picked.open).toBe(false)
    expect(labelOf(picked)).toBe('Weekly')
    expect(labelOf(start)).toBe('Choose')
  })

  it('refuses a disabled option and one of another instance, since a click on either still sends its Message', () => {
    expect(popupUpdate(open, PopupMessage.Picked({ id: 'p:daily' })).model).toBe(open)
    expect(popupUpdate(open, PopupMessage.Picked({ id: 'q:weekly' })).model).toBe(open)
  })
})

describe('the list', () => {
  const run = async (command: { readonly effect: Effect.Effect<unknown, never, never> }) =>
    (await Effect.runPromise(command.effect)) as ListMessage

  it('removes a row only when its Presence says it is hidden', async () => {
    const start = listInitial().model
    const hiding = listUpdate(start, ListMessage.Dismissed({ id: 'item-2' }))
    expect(hiding.model.presence['item-2']?.phase).toBe('hiding')
    // Still in the items, so the row is drawn, inert, for the whole exit.
    expect(hiding.model.items.map(item => item.id)).toEqual(['item-1', 'item-2', 'item-3'])
    const hidden = await run(hiding.commands![0]!)
    const gone = listUpdate(hiding.model, hidden).model
    expect(gone.items.map(item => item.id)).toEqual(['item-1', 'item-3'])
    expect(Object.keys(gone.presence)).toEqual(['item-1', 'item-3'])
  })

  it('keeps a row that is shown again before its exit finished', async () => {
    const start = listInitial().model
    const hiding = listUpdate(start, ListMessage.Dismissed({ id: 'item-2' }))
    const late = await run(hiding.commands![0]!)
    const shown = listUpdate(hiding.model, GotPresence.make('item-2', PresenceMessage.Show())).model
    const after = listUpdate(shown, late).model
    expect(after.items.map(item => item.id)).toEqual(['item-1', 'item-2', 'item-3'])
    expect(after.presence['item-2']?.phase).toBe('shown')
  })

  it('applies a drop to its items, and a drop over no place leaves them as they were', () => {
    const ids = (model: ReturnType<typeof listInitial>['model']) => model.items.map(item => item.id)
    const grab = (model: ReturnType<typeof listInitial>['model']) =>
      listUpdate(
        model,
        Rows.wrapper.make(
          Reorder.Message.Grabbed({ id: 'item-1', by: 'pointer', at: Option.none() }),
        ),
      ).model
    const start = listInitial().model
    const moved = listUpdate(
      grab(start),
      Rows.wrapper.make(
        Reorder.Message.Released({ over: Option.some({ id: 'item-3', zone: 'after' as const }) }),
      ),
    ).model
    expect(ids(moved)).toEqual(['item-2', 'item-3', 'item-1'])
    // The live region is about to say it, with the title and not the id.
    expect(moved.live.pending?.message).toContain('Write the guide')
    const putBack = listUpdate(
      grab(start),
      Rows.wrapper.make(Reorder.Message.Released({ over: Option.none() })),
    ).model
    expect(ids(putBack)).toEqual(['item-1', 'item-2', 'item-3'])
  })

  it('adds a row of its own with a Presence placed for it, and names each after the count', () => {
    const one = listUpdate(listInitial().model, ListMessage.Added()).model
    const two = listUpdate(one, ListMessage.Added()).model
    expect(two.items.slice(3).map(item => item.id)).toEqual(['new-1', 'new-2'])
    expect(two.items.slice(3).every(item => two.presence[item.id]?.phase === 'shown')).toBe(true)
  })

  it('renames on commit, keeps the old title for a blank one, and cancels with nothing changed', () => {
    const start = listInitial().model
    const editing = listUpdate(start, ListMessage.StartedEdit({ id: 'item-3' })).model
    expect(editing.draft).toBe('Ship it')
    const drafted = listUpdate(editing, ListMessage.Drafted({ text: ' Shipped ' })).model
    expect(listUpdate(drafted, ListMessage.Committed()).model.items[2]?.title).toBe('Shipped')
    const blank = listUpdate(editing, ListMessage.Drafted({ text: '   ' })).model
    expect(listUpdate(blank, ListMessage.Committed()).model.items[2]?.title).toBe('Ship it')
    expect(listUpdate(drafted, ListMessage.Cancelled()).model.items[2]?.title).toBe('Ship it')
    expect(listUpdate(start, ListMessage.Committed()).model).toBe(start)
  })
})

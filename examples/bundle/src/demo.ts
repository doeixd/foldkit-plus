/**
 * Drives the settings page through its update and prints what each placement
 * did, so the transcript can be pinned by a test.
 */
import { Effect, Stream } from 'effect'
import type * as Update from 'foldkit/update'
import {
  GotDarkMessage,
  GotTabsMessage,
  GotUploadMessage,
  Message,
  MediaQueryMessage,
  placementKeys,
  settingsFindings,
  settingsOwnership,
  config,
  type Model,
} from './app.js'
import * as Tabs from '@foldkit/ui/tabs'

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  const log = (line: string) => lines.push(line)

  log(`placements: ${placementKeys.join(', ')}`)
  log(`subscriptions: ${Object.keys(config.subscriptions).join(', ')}`)

  let model: Model = config.init().model
  log(`init: dark=${model.dark.matches} tabs=${model.tabs.id} section=${model.section}`)

  const send = (message: Message) => {
    const result: Update.Return<Model, Message> = config.update(model, message)
    model = result.model
    return result
  }

  // The Dark placement's Subscription, read through the placed record.
  const darkEntry = config.subscriptions['MediaQuery@dark/changes']!
  const dependencies = darkEntry.modelToDependencies(model)
  const emitted = Effect.runSync(
    Stream.runCollect(
      Stream.take(
        darkEntry.dependenciesToStream(dependencies, () => dependencies),
        1,
      ),
    ),
  )
  for (const message of emitted) send(message)
  log(`dark after its subscription: ${model.dark.matches}, narrow: ${model.narrow.matches}`)

  send(GotDarkMessage.make(MediaQueryMessage.Changed({ matches: false })))
  log(`dark after GotDarkMessage: ${model.dark.matches}`)

  send(GotTabsMessage.make(Tabs.Message.SelectedTab({ index: 1, value: 'uploads' })))
  log(`section after the Tabs OutMessage: ${model.section}`)

  send(Message.ChoseFile({ id: 'u1', name: 'photo.png' }))
  send(Message.ChoseFile({ id: 'u2', name: 'notes.txt' }))
  log(
    `uploads: ${Object.entries(model.uploads)
      .map(([id, upload]) => `${id}=${upload.name}`)
      .join(', ')}`,
  )

  send(GotUploadMessage.make('u2', { _tag: 'Progressed', percent: 40 }))
  send(GotUploadMessage.make('u1', { _tag: 'Progressed', percent: 100 }))
  log(
    `progress: ${Object.entries(model.uploads)
      .map(([id, upload]) => `${id}=${upload.percent}%`)
      .join(', ')}`,
  )
  log(`finished: ${model.finished.join(', ')}`)

  send(Message.ClickedRestart({ id: 'u1' }))
  log(`u1 after restart: ${model.uploads['u1']?.percent}%`)

  log(`findings: ${settingsFindings().length}`)
  for (const line of settingsOwnership().split('\n').slice(1, 9)) log(line)
  return lines
}

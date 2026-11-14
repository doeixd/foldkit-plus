import { Agent } from 'foldkit-agent'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type { Layer } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import { Message, Model, initial, update } from './app.js'
import { SaveEditor } from './view.js'

/**
 * The editor in `container`, hosted for an agent: `host` reads its Model and
 * sends it Messages through the same queue a click does.
 */
export const mountEditor = (container: HTMLElement, client: Layer.Layer<RemoteClient>) => {
  const { config, host } = Agent.host({
    Model,
    container,
    init: initial,
    update,
    view: (model: Model, h: HtmlBuilder<Message>) => SaveEditor(model, h),
    resources: client,
  })
  const handle = Runtime.embed(Runtime.makeElement(config))
  return { dispose: () => handle.dispose(), host }
}

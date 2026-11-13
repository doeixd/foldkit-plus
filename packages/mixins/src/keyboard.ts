/**
 * Route named exact key gestures through a single keydown owner. Foldkit skips
 * IME composition, prevents the native default only for a returned Message,
 * and lets the event propagate. Repeated keys follow the same routes.
 */
import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import * as Behavior from './behavior.js'
import * as Capability from './capability.js'
import { DiagnosticError } from './diagnostics.js'
import * as Event from './event.js'

/** Modifiers omitted from a gesture must be up. */
export type Modifiers = Partial<KeyboardModifiers>

export interface Route<Input, Message> {
  readonly name: string
  readonly key: string
  readonly modifiers?: Modifiers
  /** Return none to leave this key's native default alone. */
  readonly toMessage: (input: Input) => Option.Option<Message>
}

const mask = (modifiers: Modifiers): number =>
  (modifiers.shiftKey ? 1 : 0) |
  (modifiers.ctrlKey ? 2 : 0) |
  (modifiers.altKey ? 4 : 0) |
  (modifiers.metaKey ? 8 : 0)

/** Attach one keydown owner for a set of disjoint, named gestures. */
export const behavior =
  <Slots>(slots: Slots) =>
  <Input, Message>(options: {
    readonly target: keyof Slots & string
    readonly routes: ReadonlyArray<Route<Input, Message>>
  }): Behavior.NamedBehavior<Slots, Input, Message> => {
    const byKey = new Map<string, Map<number, Route<Input, Message>>>()
    for (const route of options.routes) {
      let chords = byKey.get(route.key)
      if (chords === undefined) {
        chords = new Map()
        byKey.set(route.key, chords)
      }
      const chord = mask(route.modifiers ?? {})
      const owner = chords.get(chord)
      if (owner !== undefined) {
        throw new DiagnosticError({
          source: 'mixins',
          severity: 'error',
          code: 'mixins:event-conflict',
          slot: options.target,
          message: `slot "${options.target}" has overlapping keydown routes "${owner.name}" and "${route.name}" for "${route.key}"`,
          details: {
            event: 'keydown',
            key: route.key,
            modifiers: chord,
            contributors: [owner.name, route.name],
          },
        })
      }
      chords.set(chord, route)
    }
    return Behavior.forSlots(slots)<Input, Message>(
      {
        [options.target]: Behavior.slot({
          requires: { capability: Capability.Interactive, events: [Event.KeyDown] },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: import('foldkit/html').HtmlBuilder<Message>
          }) => [
            h.OnKeyDownPreventDefault(
              (key, modifiers) =>
                byKey.get(key)?.get(mask(modifiers))?.toMessage(input) ?? Option.none(),
            ),
          ],
        }),
        // Keyed by the caller's chosen slot; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'Keyboard' },
    )
  }

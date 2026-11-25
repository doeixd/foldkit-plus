/**
 * Lazy per-Message chunk for `ClickedAddDomain` (Phase 7, Bout 7.7).
 *
 * Loaded on intent (`pointerover` / `focusin` / `touchstart`), idle, or press
 * by `examples/foldkit/domains-plus/src/client/binder.ts`.
 */
import { Schema } from 'effect'
import { Transition } from 'metakit'
import type { BinderTransition } from 'foldkit-ssr/binder'
import {
  BinderModelSchema,
  NameInput,
  binderForeign,
  type BinderModel,
  type CartDomain,
} from '../binderShared.js'

export const makeAddDomainEntry = (
  quotes: ReadonlyMap<string, CartDomain>,
): BinderTransition<BinderModel, 'ClickedAddDomain'> => ({
  tag: 'ClickedAddDomain',
  schema: NameInput,
  foreign: binderForeign,
  transition: Transition.opaque({
    name: 'domains.binder.ClickedAddDomain',
    state: BinderModelSchema,
    input: NameInput,
    reads: ({ state, input }) => [state.cart, input.name],
    writes: ({ state }) => [state.cart],
    run: (model, { name }) => {
      if (model.cart.some(item => item.name === name)) return model
      const quote = quotes.get(name)
      if (quote === undefined) return model
      return { cart: [...model.cart, quote] }
    },
  }),
})

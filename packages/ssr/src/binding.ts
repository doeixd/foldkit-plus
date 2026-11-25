/**
 * `Binding` (Phase 6, Bout 6.4): typed DOM anchor bindings declared per Surface.
 *
 * Each binding names how a Model expression maps to a DOM anchor (`Text`,
 * `Attribute`, `Shown`, or `Order`). `Binding.define` turns a record of
 * bindings into a `Bindings<Model, Keys>` object whose `attr(h, key)` writes
 * `data-fk-anchor="<key>"` and refuses any undeclared key at compile time.
 */
import { Option } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import { Expr, Path } from 'metakit'
import { minimizePaths } from 'metakit/graph/match'

/** Attribute written on every anchored element by the server. */
export const ANCHOR_ATTRIBUTE = 'data-fk-anchor' as const

export interface TextBinding<Model> {
  readonly _tag: 'Text'
  readonly expr: Expr.Expr<Model, string | number | boolean | null>
}

export interface AttributeBinding<Model> {
  readonly _tag: 'Attribute'
  readonly name: string
  readonly expr: Expr.Expr<Model, string | number | boolean | null>
}

export interface ShownBinding<Model> {
  readonly _tag: 'Shown'
  readonly expr: Expr.Expr<Model, boolean | null>
}

export interface OrderBinding<Model, Key extends string = string> {
  readonly _tag: 'Order'
  readonly listPath: Path.Path<Model, ReadonlyArray<unknown>>
  readonly key: Key
}

export type AnyBinding<Model> =
  | TextBinding<Model>
  | AttributeBinding<Model>
  | ShownBinding<Model>
  | OrderBinding<Model, string>

export type BindingValue =
  | { readonly _tag: 'Text'; readonly text: string }
  | { readonly _tag: 'Attribute'; readonly name: string; readonly value: string | null }
  | { readonly _tag: 'Shown'; readonly shown: boolean }
  | { readonly _tag: 'Order'; readonly keys: ReadonlyArray<string> }

export interface Bindings<Model, Keys extends string = string> {
  readonly entries: Readonly<Record<Keys, AnyBinding<Model>>>
  readonly keys: ReadonlyArray<Keys>
  /** Static Model paths read by all bindings, or `Option.none()` if any binding is opaque. */
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** Returns the `data-fk-anchor="<key>"` attribute for a declared binding key. */
  readonly attr: <Message>(h: HtmlBuilder<Message>, key: Keys) => Attribute<Message>
  /** Returns `[ANCHOR_ATTRIBUTE, key]` for tests or custom renderers. */
  readonly anchor: (key: Keys) => readonly [typeof ANCHOR_ATTRIBUTE, Keys]
  /** Evaluates every binding against `model` (used by server checks and the binder). */
  readonly evaluate: (model: Model) => Readonly<Record<Keys, BindingValue>>
}

const readsOfBinding = <Model>(
  binding: AnyBinding<Model>,
): Option.Option<ReadonlyArray<ReadonlyArray<string>>> => {
  switch (binding._tag) {
    case 'Text':
    case 'Attribute':
    case 'Shown':
      return Expr.reads(binding.expr)
    case 'Order':
      return Option.some([[...binding.listPath.segments, '*', binding.key]])
  }
}

const evaluateBinding = <Model>(binding: AnyBinding<Model>, model: Model): BindingValue => {
  switch (binding._tag) {
    case 'Text': {
      const value = Expr.evaluate(binding.expr, model)
      return { _tag: 'Text', text: value === null || value === undefined ? '' : String(value) }
    }
    case 'Attribute': {
      const value = Expr.evaluate(binding.expr, model)
      return {
        _tag: 'Attribute',
        name: binding.name,
        value: value === null || value === undefined ? null : String(value),
      }
    }
    case 'Shown': {
      const value = Expr.evaluate(binding.expr, model)
      return { _tag: 'Shown', shown: value === true }
    }
    case 'Order': {
      const list = Path.get(binding.listPath, model)
      if (Option.isNone(list) || !Array.isArray(list.value)) {
        return { _tag: 'Order', keys: [] }
      }
      const keys: Array<string> = []
      for (const item of list.value) {
        if (item !== null && typeof item === 'object' && Object.hasOwn(item, binding.key)) {
          keys.push(String((item as Record<string, unknown>)[binding.key]))
        }
      }
      return { _tag: 'Order', keys }
    }
  }
}

export const Binding = {
  /** Text content of an anchored element, written as `textContent` (never HTML). */
  text: <Model>(expr: Expr.Expr<Model, string | number | boolean | null>): TextBinding<Model> => ({
    _tag: 'Text',
    expr,
  }),

  /** Attribute `name` of an anchored element (`null` removes the attribute). */
  attribute: <Model>(
    name: string,
    expr: Expr.Expr<Model, string | number | boolean | null>,
  ): AttributeBinding<Model> => ({
    _tag: 'Attribute',
    name,
    expr,
  }),

  /** Visibility of an anchored element (`hidden` toggled when `false`). */
  shown: <Model>(expr: Expr.Expr<Model, boolean | null>): ShownBinding<Model> => ({
    _tag: 'Shown',
    expr,
  }),

  /** Child element ordering of an anchored container, keyed by `key` on `listPath`'s elements. */
  order: <Model, E, K extends keyof E & string>(
    listPath: Path.Path<Model, ReadonlyArray<E>>,
    key: K,
  ): OrderBinding<Model, K> => ({
    _tag: 'Order',
    listPath: listPath as Path.Path<Model, ReadonlyArray<unknown>>,
    key,
  }),

  /**
   * Declare a Surface's typed anchor bindings. Any key passed to `attr` or
   * `anchor` that is not in `spec` fails to compile and throws at runtime.
   */
  define: <
    Model,
    const Spec extends Readonly<Record<string, AnyBinding<Model>>> = Readonly<
      Record<string, AnyBinding<Model>>
    >,
  >(
    spec: Spec & Readonly<Record<string, AnyBinding<Model>>>,
  ): Bindings<Model, keyof Spec & string> => {
    type Keys = keyof Spec & string
    const keys = Object.keys(spec) as Array<Keys>
    const keySet = new Set<string>(keys)

    let unbounded = false
    const allReads: Array<ReadonlyArray<string>> = []
    for (const key of keys) {
      const r = readsOfBinding(spec[key]!)
      if (Option.isNone(r)) {
        unbounded = true
      } else {
        for (const p of r.value) allReads.push(p)
      }
    }

    const assertDeclared = (key: Keys): void => {
      if (!keySet.has(key)) {
        throw new Error(
          `[foldkit-ssr] Binding: anchor key "${key}" is not declared in this Surface's bindings`,
        )
      }
    }

    return {
      entries: spec as Readonly<Record<Keys, AnyBinding<Model>>>,
      keys,
      reads: unbounded ? Option.none() : Option.some(minimizePaths(allReads)),
      attr: (h, key) => {
        assertDeclared(key)
        return h.DataAttribute('fk-anchor', key)
      },
      anchor: key => {
        assertDeclared(key)
        return [ANCHOR_ATTRIBUTE, key] as const
      },
      evaluate: model => {
        const out: Record<string, BindingValue> = Object.create(null)
        for (const key of keys) {
          out[key] = evaluateBinding(spec[key]!, model)
        }
        return out as Readonly<Record<Keys, BindingValue>>
      },
    }
  },
}

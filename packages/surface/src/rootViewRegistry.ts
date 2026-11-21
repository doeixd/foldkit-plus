/**
 * Internal registry connecting an application's `owner` token to an installed
 * `Writes` path-skipping `rootView` hook (#587). Kept in its own tiny module
 * so `foldkit-surface` carries zero `metakit` code when no machine is used.
 */
import type { Html } from 'foldkit/html'

export type RootViewHook = (
  surface: unknown,
  params: unknown,
  render: unknown,
) => (root: unknown, h: unknown) => Html

const overrides = new WeakMap<object, RootViewHook>()

export const getRootViewHook = (owner: object): RootViewHook | undefined => overrides.get(owner)

export const registerRootViewHook = (owner: object, hook: RootViewHook): (() => void) => {
  overrides.set(owner, hook)
  return () => {
    if (overrides.get(owner) === hook) overrides.delete(owner)
  }
}

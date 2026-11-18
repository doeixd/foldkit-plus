/**
 * Every `Bundles.X`'s type, written out by this project's declaration emit as
 * an application exporting a placed Bundle gets it. A type in a Bundle's args
 * or helpers that `foldkit-mixins-ui` does not export by name fails the build
 * here with TS2883 ("cannot be named without a reference to …"), as
 * `ToastInput` did for the focus-kept island's `App`. Nothing imports it.
 */
import { Bundles } from 'foldkit-mixins-ui'

export const bundles = { ...Bundles }

import * as UiTabs from '@foldkit/ui/tabs'
import { Bundle } from 'foldkit-bundle'

const bound: UiTabs.Bundle = UiTabs.create()

/**
 * Tabs' interaction state for `foldkit-bundle`: the focus cursor, and whether
 * a focused tab is chosen as it is reached (`Automatic`) or on Enter
 * (`Manual`), with `id` and `activationMode` as the args. The chosen value is
 * the application's: answer the `Selected` OutMessage in `onOut` and give it
 * back as `Tabs.view`'s `value`. It holds no view.
 */
export const Tabs = Bundle.fromParts('Tabs', {
  Model: UiTabs.Model,
  Message: UiTabs.Message,
  init: (args: UiTabs.InitConfig) => UiTabs.init(args),
  parts: { update: bound.update },
})

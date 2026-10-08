/**
 * The interactive showcase: every widget live on one page, each as its own
 * `makeElement` island in its own container. Islands share nothing — the
 * point of the page is that each composition stands alone.
 */
import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import * as Accordion from './accordion/app.js'
import { Accordion as AccordionView, AccordionSlots } from './accordion/view.js'
import * as AlertDialog from './alert-dialog/app.js'
import { AlertDialog as AlertDialogView, AlertDialogSlots } from './alert-dialog/view.js'
import * as CheckboxGroup from './checkbox-group/app.js'
import { CheckboxGroup as CheckboxGroupView, CheckboxGroupSlots } from './checkbox-group/view.js'
import * as Command from './command/app.js'
import { Command as CommandView, CommandSlots } from './command/view.js'
import * as Meter from './meter/app.js'
import { Meter as MeterView, MeterSlots } from './meter/view.js'
import * as NumberField from './number-field/app.js'
import { NumberField as NumberFieldView, NumberFieldSlots } from './number-field/view.js'
import * as Toggle from './toggle/app.js'
import { Toggle as ToggleView, ToggleSlots } from './toggle/view.js'
import * as ToggleGroup from './toggle-group/app.js'
import { ToggleGroup as ToggleGroupView, ToggleGroupSlots } from './toggle-group/view.js'
import * as Toolbar from './toolbar/app.js'
import { Toolbar as ToolbarView, ToolbarSlots } from './toolbar/view.js'
import {
  accordionStyle,
  alertDialogStyle,
  checkboxGroupStyle,
  commandStyle,
  meterStyle,
  numberFieldStyle,
  toggleGroupStyle,
  toggleStyle,
  toolbarStyle,
} from './style.js'

Style.install(
  Style.stylesheet(
    toolbarStyle(ToolbarSlots),
    toggleStyle(ToggleSlots),
    toggleGroupStyle(ToggleGroupSlots),
    accordionStyle(AccordionSlots),
    alertDialogStyle(AlertDialogSlots),
    numberFieldStyle(NumberFieldSlots),
    checkboxGroupStyle(CheckboxGroupSlots),
    meterStyle(MeterSlots),
    commandStyle(CommandSlots),
  ),
)

const island = (id: string): HTMLElement => {
  const container = document.getElementById(id)
  if (container === null) throw new Error(`#${id} is missing from index.html`)
  if (!(container instanceof HTMLElement)) throw new Error(`#${id} is not an element`)
  container.id = id
  return container
}

const islands = [
  Runtime.makeElement({
    Model: Toolbar.Model,
    init: () => Toolbar.initial,
    update: Toolbar.update,
    view: (model, h) => ToolbarView(model, h),
    container: island('toolbar'),
  }),
  Runtime.makeElement({
    Model: Toggle.Model,
    init: () => ({ model: Toggle.initial }),
    update: Toggle.update,
    view: (model, h) => ToggleView(model, h),
    container: island('toggle'),
  }),
  Runtime.makeElement({
    Model: ToggleGroup.Model,
    init: () => ToggleGroup.initial,
    update: ToggleGroup.update,
    view: (model, h) => ToggleGroupView(model, h),
    container: island('toggle-group'),
  }),
  Runtime.makeElement({
    Model: Accordion.Model,
    init: () => ({ model: Accordion.initial }),
    update: Accordion.update,
    view: (model, h) => AccordionView(model, h),
    container: island('accordion'),
  }),
  Runtime.makeElement({
    Model: AlertDialog.Model,
    init: () => AlertDialog.initial,
    update: AlertDialog.update,
    view: (model, h) => AlertDialogView(model, h),
    container: island('alert-dialog'),
  }),
  Runtime.makeElement({
    Model: NumberField.Model,
    init: () => ({ model: NumberField.initial }),
    update: NumberField.update,
    view: (model, h) => NumberFieldView(model, h),
    container: island('number-field'),
  }),
  Runtime.makeElement({
    Model: CheckboxGroup.Model,
    init: () => CheckboxGroup.initial,
    update: CheckboxGroup.update,
    view: (model, h) => CheckboxGroupView(model, h),
    container: island('checkbox-group'),
  }),
  Runtime.makeElement({
    Model: Meter.Model,
    init: () => ({ model: Meter.initial }),
    update: Meter.update,
    view: (model, h) => MeterView(model, h),
    container: island('meter'),
  }),
  Runtime.makeElement({
    Model: Command.Model,
    init: () => Command.initial,
    update: Command.update,
    view: (model, h) => CommandView(model, h),
    container: island('command'),
  }),
]

for (const program of islands) {
  Runtime.embed(program)
}

/**
 * Every showcase island in one registry: adding a widget means adding one
 * entry here (plus its folder and tests) — `entry.ts`, `main.ts`, the page
 * sections, and the style sheet all derive from this list, so no wiring
 * file names widgets one by one anymore. Each `mount` closure keeps its own
 * Model and Message types; the list only ever reads the shared fields.
 */
import { Runtime } from 'foldkit'
import { type StylesheetSource } from 'foldkit-mixins'
import * as Accordion from './accordion/app.js'
import {
  Accordion as AccordionView,
  AccordionSlots,
  runDemo as runAccordionDemo,
} from './accordion/view.js'
import * as AlertDialog from './alert-dialog/app.js'
import {
  AlertDialog as AlertDialogView,
  AlertDialogSlots,
  runDemo as runAlertDialogDemo,
} from './alert-dialog/view.js'
import * as Autocomplete from './autocomplete/app.js'
import {
  Autocomplete as AutocompleteView,
  AutocompleteSlots,
  runDemo as runAutocompleteDemo,
} from './autocomplete/view.js'
import * as CheckboxGroup from './checkbox-group/app.js'
import {
  CheckboxGroup as CheckboxGroupView,
  CheckboxGroupSlots,
  runDemo as runCheckboxGroupDemo,
} from './checkbox-group/view.js'
import * as Command from './command/app.js'
import { Command as CommandView, CommandSlots, runDemo as runCommandDemo } from './command/view.js'
import * as ContextMenu from './context-menu/app.js'
import {
  ContextMenu as ContextMenuView,
  ContextMenuSlots,
  runDemo as runContextMenuDemo,
} from './context-menu/view.js'
import * as HoverCard from './hover-card/app.js'
import {
  HoverCard as HoverCardView,
  HoverCardSlots,
  runDemo as runHoverCardDemo,
} from './hover-card/view.js'
import * as Menubar from './menubar/app.js'
import { Menubar as MenubarView, MenubarSlots, runDemo as runMenubarDemo } from './menubar/view.js'
import * as Meter from './meter/app.js'
import { Meter as MeterView, MeterSlots, runDemo as runMeterDemo } from './meter/view.js'
import * as NavigationMenu from './navigation-menu/app.js'
import {
  NavigationMenu as NavigationMenuView,
  NavigationMenuSlots,
  runDemo as runNavigationMenuDemo,
} from './navigation-menu/view.js'
import * as NativeSelect from './native-select/app.js'
import {
  NativeSelect as NativeSelectView,
  NativeSelectSlots,
  runDemo as runNativeSelectDemo,
} from './native-select/view.js'
import * as Sidebar from './sidebar/app.js'
import { Sidebar as SidebarView, SidebarSlots, runDemo as runSidebarDemo } from './sidebar/view.js'
import * as NumberField from './number-field/app.js'
import {
  NumberField as NumberFieldView,
  NumberFieldSlots,
  runDemo as runNumberFieldDemo,
} from './number-field/view.js'
import * as OtpField from './otp-field/app.js'
import {
  OtpField as OtpFieldView,
  OtpFieldSlots,
  runDemo as runOtpFieldDemo,
} from './otp-field/view.js'
import * as Progress from './progress/app.js'
import {
  Progress as ProgressView,
  ProgressSlots,
  runDemo as runProgressDemo,
} from './progress/view.js'
import * as Toggle from './toggle/app.js'
import { Toggle as ToggleView, ToggleSlots, runDemo as runToggleDemo } from './toggle/view.js'
import * as ToggleGroup from './toggle-group/app.js'
import {
  ToggleGroup as ToggleGroupView,
  ToggleGroupSlots,
  runDemo as runToggleGroupDemo,
} from './toggle-group/view.js'
import * as Toolbar from './toolbar/app.js'
import { Toolbar as ToolbarView, ToolbarSlots } from './toolbar/view.js'
import { runDemo as runToolbarDemo } from './toolbar/demo.js'
import {
  accordionStyle,
  alertDialogStyle,
  autocompleteStyle,
  checkboxGroupStyle,
  commandStyle,
  contextMenuStyle,
  hoverCardStyle,
  menubarStyle,
  meterStyle,
  navigationMenuStyle,
  nativeSelectStyle,
  numberFieldStyle,
  sidebarStyle,
  otpFieldStyle,
  progressStyle,
  toggleGroupStyle,
  toggleStyle,
  toolbarStyle,
} from './style.js'

export interface Island {
  readonly id: string
  readonly title: string
  readonly runDemo: () => ReadonlyArray<string>
  readonly style: () => StylesheetSource
  readonly mount: (container: HTMLElement) => void
}

const define = <T extends Island>(island: T): T => island

export const islands = [
  define({
    id: 'toolbar',
    title: 'Toolbar',
    runDemo: runToolbarDemo,
    style: () => toolbarStyle(ToolbarSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Toolbar.Model,
          init: () => Toolbar.initial,
          update: Toolbar.update,
          view: (model, h) => ToolbarView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'toggle',
    title: 'Toggle',
    runDemo: runToggleDemo,
    style: () => toggleStyle(ToggleSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Toggle.Model,
          init: () => ({ model: Toggle.initial }),
          update: Toggle.update,
          view: (model, h) => ToggleView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'toggle-group',
    title: 'Toggle group',
    runDemo: runToggleGroupDemo,
    style: () => toggleGroupStyle(ToggleGroupSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: ToggleGroup.Model,
          init: () => ToggleGroup.initial,
          update: ToggleGroup.update,
          view: (model, h) => ToggleGroupView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'accordion',
    title: 'Accordion',
    runDemo: runAccordionDemo,
    style: () => accordionStyle(AccordionSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Accordion.Model,
          init: () => ({ model: Accordion.initial }),
          update: Accordion.update,
          view: (model, h) => AccordionView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'alert-dialog',
    title: 'Alert dialog',
    runDemo: runAlertDialogDemo,
    style: () => alertDialogStyle(AlertDialogSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: AlertDialog.Model,
          init: () => AlertDialog.initial,
          update: AlertDialog.update,
          view: (model, h) => AlertDialogView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'autocomplete',
    title: 'Autocomplete',
    runDemo: runAutocompleteDemo,
    style: () => autocompleteStyle(AutocompleteSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Autocomplete.Model,
          init: () => Autocomplete.initial,
          update: Autocomplete.update,
          view: (model, h) => AutocompleteView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'number-field',
    title: 'Number field',
    runDemo: runNumberFieldDemo,
    style: () => numberFieldStyle(NumberFieldSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: NumberField.Model,
          init: () => ({ model: NumberField.initial }),
          update: NumberField.update,
          view: (model, h) => NumberFieldView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'otp-field',
    title: 'One-time code',
    runDemo: runOtpFieldDemo,
    style: () => otpFieldStyle(OtpFieldSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: OtpField.Model,
          init: () => OtpField.initial,
          update: OtpField.update,
          view: (model, h) => OtpFieldView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'checkbox-group',
    title: 'Checkbox group',
    runDemo: runCheckboxGroupDemo,
    style: () => checkboxGroupStyle(CheckboxGroupSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: CheckboxGroup.Model,
          init: () => CheckboxGroup.initial,
          update: CheckboxGroup.update,
          view: (model, h) => CheckboxGroupView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'meter',
    title: 'Meter',
    runDemo: runMeterDemo,
    style: () => meterStyle(MeterSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Meter.Model,
          init: () => ({ model: Meter.initial }),
          update: Meter.update,
          view: (model, h) => MeterView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'progress',
    title: 'Progress',
    runDemo: runProgressDemo,
    style: () => progressStyle(ProgressSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Progress.Model,
          init: () => ({ model: Progress.initial }),
          update: Progress.update,
          view: (model, h) => ProgressView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'command',
    title: 'Command',
    runDemo: runCommandDemo,
    style: () => commandStyle(CommandSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Command.Model,
          init: () => Command.initial,
          update: Command.update,
          view: (model, h) => CommandView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'context-menu',
    title: 'Context menu',
    runDemo: runContextMenuDemo,
    style: () => contextMenuStyle(ContextMenuSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: ContextMenu.Model,
          init: () => ContextMenu.initial,
          update: ContextMenu.update,
          view: (model, h) => ContextMenuView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'hover-card',
    title: 'Hover card',
    runDemo: runHoverCardDemo,
    style: () => hoverCardStyle(HoverCardSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: HoverCard.Model,
          init: () => HoverCard.initial,
          update: HoverCard.update,
          view: (model, h) => HoverCardView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'menubar',
    title: 'Menu bar',
    runDemo: runMenubarDemo,
    style: () => menubarStyle(MenubarSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Menubar.Model,
          init: () => Menubar.initial,
          update: Menubar.update,
          view: (model, h) => MenubarView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'native-select',
    title: 'Native select',
    runDemo: runNativeSelectDemo,
    style: () => nativeSelectStyle(NativeSelectSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: NativeSelect.Model,
          init: () => ({ model: NativeSelect.initial }),
          update: NativeSelect.update,
          view: (model, h) => NativeSelectView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'navigation-menu',
    title: 'Navigation menu',
    runDemo: runNavigationMenuDemo,
    style: () => navigationMenuStyle(NavigationMenuSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: NavigationMenu.Model,
          init: () => NavigationMenu.initial,
          update: NavigationMenu.update,
          view: (model, h) => NavigationMenuView(model, h),
          container,
        }),
      )
    },
  }),
  define({
    id: 'sidebar',
    title: 'Sidebar',
    runDemo: runSidebarDemo,
    style: () => sidebarStyle(SidebarSlots),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Sidebar.Model,
          init: () => ({ model: Sidebar.initial }),
          update: Sidebar.update,
          view: (model, h) => SidebarView(model, h),
          container,
        }),
      )
    },
  }),
] as const

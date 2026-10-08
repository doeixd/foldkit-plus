import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Style } from 'foldkit-mixins'
import { AlertDialog, AlertDialogSlots } from '../src/alert-dialog/view.js'
import { initial as alertInitial } from '../src/alert-dialog/app.js'
import { Accordion, AccordionSlots } from '../src/accordion/view.js'
import { initial as accordionInitial } from '../src/accordion/app.js'
import { CheckboxGroup, CheckboxGroupSlots } from '../src/checkbox-group/view.js'
import { initial as checkboxInitial } from '../src/checkbox-group/app.js'
import { Command, CommandSlots } from '../src/command/view.js'
import { initial as commandInitial } from '../src/command/app.js'
import { Meter, MeterSlots } from '../src/meter/view.js'
import { initial as meterInitial } from '../src/meter/app.js'
import { NumberField, NumberFieldSlots } from '../src/number-field/view.js'
import { initial as numberInitial } from '../src/number-field/app.js'
import { Toggle, ToggleSlots } from '../src/toggle/view.js'
import { initial as toggleInitial } from '../src/toggle/app.js'
import { ToggleGroup, ToggleGroupSlots } from '../src/toggle-group/view.js'
import { initial as toggleGroupInitial } from '../src/toggle-group/app.js'
import { Toolbar, ToolbarSlots } from '../src/toolbar/view.js'
import { initial as toolbarInitial } from '../src/toolbar/app.js'
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
} from '../src/style.js'

const sheet = (): string =>
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
  )

describe('showcase styles', () => {
  it('builds one sheet with state read from ARIA', () => {
    const css = sheet()
    expect(css).toContain('[aria-pressed="true"]')
    expect(css).toContain('[aria-selected="true"]')
    expect(css).toContain('[aria-expanded="true"]')
    expect(css).toContain(':focus-visible')
  })

  it('dresses every widget with classes and no missing tokens', () => {
    const pages = [
      Inert.draw(Toolbar, toolbarInitial.model),
      Inert.draw(Toggle, toggleInitial),
      Inert.draw(ToggleGroup, toggleGroupInitial.model),
      Inert.draw(Accordion, accordionInitial),
      Inert.draw(AlertDialog, alertInitial.model),
      Inert.draw(NumberField, numberInitial),
      Inert.draw(CheckboxGroup, checkboxInitial.model),
      Inert.draw(Meter, meterInitial),
      Inert.draw(Command, commandInitial.model),
    ]
    for (const page of pages) {
      expect(Inert.css([page!]).length).toBeGreaterThan(0)
      expect(Inert.missingTokens(page!, sheet())).toEqual([])
    }
  })
})

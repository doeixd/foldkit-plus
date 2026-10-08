import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Style } from 'foldkit-mixins'
import { AlertDialog } from '../src/alert-dialog/view.js'
import { initial as alertInitial } from '../src/alert-dialog/app.js'
import { Autocomplete } from '../src/autocomplete/view.js'
import { initial as autocompleteInitial } from '../src/autocomplete/app.js'
import { Accordion } from '../src/accordion/view.js'
import { initial as accordionInitial } from '../src/accordion/app.js'
import { CheckboxGroup } from '../src/checkbox-group/view.js'
import { initial as checkboxInitial } from '../src/checkbox-group/app.js'
import { Command } from '../src/command/view.js'
import { initial as commandInitial } from '../src/command/app.js'
import { ContextMenu } from '../src/context-menu/view.js'
import { initial as contextInitial } from '../src/context-menu/app.js'
import { HoverCard } from '../src/hover-card/view.js'
import { initial as hoverInitial } from '../src/hover-card/app.js'
import { Menubar } from '../src/menubar/view.js'
import { initial as menubarInitial } from '../src/menubar/app.js'
import { NavigationMenu } from '../src/navigation-menu/view.js'
import { initial as navigationInitial } from '../src/navigation-menu/app.js'
import { NativeSelect } from '../src/native-select/view.js'
import { initial as nativeSelectInitial } from '../src/native-select/app.js'
import { Sidebar } from '../src/sidebar/view.js'
import { initial as sidebarInitial } from '../src/sidebar/app.js'
import { Resizable } from '../src/resizable/view.js'
import { initial as resizableInitial } from '../src/resizable/app.js'
import { Meter } from '../src/meter/view.js'
import { initial as meterInitial } from '../src/meter/app.js'
import { Progress } from '../src/progress/view.js'
import { initial as progressInitial } from '../src/progress/app.js'
import { NumberField } from '../src/number-field/view.js'
import { initial as numberInitial } from '../src/number-field/app.js'
import { OtpField } from '../src/otp-field/view.js'
import { initial as otpInitial } from '../src/otp-field/app.js'
import { Toggle } from '../src/toggle/view.js'
import { initial as toggleInitial } from '../src/toggle/app.js'
import { ToggleGroup } from '../src/toggle-group/view.js'
import { initial as toggleGroupInitial } from '../src/toggle-group/app.js'
import { Toolbar } from '../src/toolbar/view.js'
import { initial as toolbarInitial } from '../src/toolbar/app.js'
import { islands } from '../src/widgets.js'

const sheet = (): string => Style.stylesheet(...islands.map(island => island.style()))

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
      Inert.draw(Autocomplete, autocompleteInitial.model),
      Inert.draw(NumberField, numberInitial),
      Inert.draw(OtpField, otpInitial.model),
      Inert.draw(CheckboxGroup, checkboxInitial.model),
      Inert.draw(Meter, meterInitial),
      Inert.draw(Progress, progressInitial),
      Inert.draw(Command, commandInitial.model),
      Inert.draw(ContextMenu, contextInitial.model),
      Inert.draw(HoverCard, hoverInitial.model),
      Inert.draw(Menubar, menubarInitial.model),
      Inert.draw(NavigationMenu, navigationInitial.model),
      Inert.draw(NativeSelect, nativeSelectInitial),
      Inert.draw(Sidebar, sidebarInitial),
      Inert.draw(Resizable, resizableInitial),
    ]
    for (const page of pages) {
      expect(Inert.css([page!]).length).toBeGreaterThan(0)
      expect(Inert.missingTokens(page!, sheet())).toEqual([])
    }
  })
})

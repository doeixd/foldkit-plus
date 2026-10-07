/**
 * Shared combobox markup assembly with the consumer `toView` seam.
 * Transcribed from `@foldkit/ui@0.165.0` (`packages/ui/src/combobox/shared.ts`,
 * MIT (c) 2025 Devin Jameson). Assembly lives in `./comboboxView.js`.
 */
import { Array, Match, Option, Predicate, pipe } from 'effect'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import { Message } from '@foldkit/ui/combobox'
import type { Model as SingleModel } from '@foldkit/ui/combobox'
import type { BaseViewInputsCommon, GroupHeading, ItemConfig } from '@foldkit/ui/combobox'
import { childAttributes, type ChildAttribute, type Html, type HtmlBuilder } from 'foldkit/html'
import {
  findFirstEnabledIndex,
  groupContiguous,
  keyToIndex,
  whenOption as when,
} from './menuUtils.js'

export type ComboboxItemRender = Readonly<{
  key: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

export type ComboboxHeadingRender = Readonly<{
  id: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

export type ComboboxGroupRender = Readonly<{
  key: string
  heading: ComboboxHeadingRender | undefined
  group: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  separator: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  items: ReadonlyArray<ComboboxItemRender>
}>

export type ComboboxRenderInfo = Readonly<{
  id: string
  isVisible: boolean
  wrapper: ReadonlyArray<ChildAttribute>
  inputWrapper: ReadonlyArray<ChildAttribute>
  input: ReadonlyArray<ChildAttribute>
  toggleButton:
    { key: string; attributes: ReadonlyArray<ChildAttribute>; content: Html } | undefined
  backdrop: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  items: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  scroll: ReadonlyArray<ChildAttribute> | undefined
  groups: ReadonlyArray<ComboboxGroupRender>
  hiddenInputs: ReadonlyArray<Html>
}>

export type NormalizedInputs<Item extends string> = BaseViewInputsCommon<Item> &
  Readonly<{ selectedValues: ReadonlyArray<Item> }>

const itemId = (id: string, index: number): string => `${id}-item-${index}`

export const computeRender = (
  model: SingleModel,
  viewInputs: NormalizedInputs<string>,
  h: HtmlBuilder<Message>,
  behavior: Readonly<{ ariaMultiSelectable: boolean }>,
): ComboboxRenderInfo => {
  const {
    id,
    isOpen,
    immediate,
    animation: { transitionState },
    maybeActiveItemIndex,
  } = model

  const {
    items,
    selectedValues,
    restingInputValue,
    itemToConfig,
    itemToValue,
    itemToDisplayText,
    isItemDisabled,
    inputClassName,
    inputAttributes = [],
    inputPlaceholder,
    inputWrapperClassName,
    inputWrapperAttributes = [],
    itemsClassName,
    itemsAttributes = [],
    itemsScrollClassName,
    itemsScrollAttributes = [],
    backdropClassName,
    backdropAttributes = [],
    className,
    attributes = [],
    buttonContent,
    buttonClassName,
    buttonAttributes = [],
    formName,
    isDisabled,
    isReadOnly = false,
    isInvalid,
    openOnFocus,
    itemGroupKey,
    groupToHeading,
    groupClassName,
    groupAttributes = [],
    separatorClassName,
    separatorAttributes = [],
    anchor = {},
    ariaLabel,
    ariaLabelledBy,
  } = viewInputs

  const resolveInputLabel = () => {
    if (Predicate.isNotUndefined(ariaLabel)) {
      return [h.AriaLabel(ariaLabel)]
    } else if (Predicate.isNotUndefined(ariaLabelledBy)) {
      return [h.AriaLabelledBy(ariaLabelledBy)]
    } else {
      return []
    }
  }

  const inputLabelAttributes = resolveInputLabel()

  const isValueSelected = (itemValue: string): boolean => Array.contains(selectedValues, itemValue)

  const isLeaving = transitionState === 'LeaveStart' || transitionState === 'LeaveAnimating'
  const isVisible = isOpen || isLeaving
  const isItemsPanelVisible = isVisible && Array.isReadonlyArrayNonEmpty(items)
  const isBackdropVisible = isItemsPanelVisible || (isVisible && model.isModal)

  const animationAttributes = Match.value(transitionState).pipe(
    Match.when('EnterStart', () => [
      h.DataAttribute('closed', ''),
      h.DataAttribute('enter', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.when('EnterAnimating', () => [
      h.DataAttribute('enter', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.when('LeaveStart', () => [
      h.DataAttribute('leave', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.when('LeaveAnimating', () => [
      h.DataAttribute('closed', ''),
      h.DataAttribute('leave', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.orElse(() => []),
  )

  const isDisabledAtIndex = (index: number): boolean =>
    Predicate.isNotUndefined(isItemDisabled) &&
    pipe(
      items,
      Array.get(index),
      Option.exists(item => isItemDisabled(item, index)),
    )

  const firstEnabledIndex = findFirstEnabledIndex(items.length, 0, isDisabledAtIndex)(0, 1)

  const lastEnabledIndex = findFirstEnabledIndex(
    items.length,
    0,
    isDisabledAtIndex,
  )(items.length - 1, -1)

  const resolveActiveIndex = keyToIndex(
    'ArrowDown',
    'ArrowUp',
    items.length,
    Option.getOrElse(maybeActiveItemIndex, () => -1),
    isDisabledAtIndex,
  )

  const resolveImmediateSelection = (targetIndex: number): Option.Option<{ item: string }> => {
    if (isReadOnly) {
      return Option.none()
    } else {
      return pipe(
        when(immediate, targetIndex),
        Option.flatMap(index => Array.get(items, index)),
        Option.map(targetItem => ({
          item: itemToValue(targetItem, targetIndex),
        })),
      )
    }
  }

  const maybeValidActiveItemIndex = Option.flatMap(maybeActiveItemIndex, index =>
    Option.as(Array.get(items, index), index),
  )

  const resolveCommitMessage = (): Option.Option<Message> => {
    if (isReadOnly) {
      return Option.as(maybeValidActiveItemIndex, Message.SuppressedItemCommit())
    } else {
      return Option.map(maybeValidActiveItemIndex, index => Message.RequestedItemClick({ index }))
    }
  }

  const handleInputKeyDown = (key: string): Option.Option<Message> =>
    Match.value(key).pipe(
      Match.when('ArrowDown', () => {
        if (Array.isReadonlyArrayEmpty(items)) {
          return Option.some(Message.SuppressedEmptyItemNavigation())
        }

        if (!isOpen) {
          return Option.some(
            Message.Opened({
              maybeActiveItemIndex: Option.some(firstEnabledIndex),
            }),
          )
        }
        const targetIndex = resolveActiveIndex('ArrowDown')
        return Option.some(
          Message.ActivatedItem({
            index: targetIndex,
            activationTrigger: 'Keyboard',
            maybeImmediateSelection: resolveImmediateSelection(targetIndex),
          }),
        )
      }),
      Match.when('ArrowUp', () => {
        if (Array.isReadonlyArrayEmpty(items)) {
          return Option.some(Message.SuppressedEmptyItemNavigation())
        }

        if (!isOpen) {
          return Option.some(
            Message.Opened({
              maybeActiveItemIndex: Option.some(lastEnabledIndex),
            }),
          )
        }
        const targetIndex = resolveActiveIndex('ArrowUp')
        return Option.some(
          Message.ActivatedItem({
            index: targetIndex,
            activationTrigger: 'Keyboard',
            maybeImmediateSelection: resolveImmediateSelection(targetIndex),
          }),
        )
      }),
      Match.when('Enter', () => {
        if (!isOpen) {
          return Option.none()
        }
        return resolveCommitMessage()
      }),
      Match.when('Escape', () => {
        if (!isOpen) {
          return Option.none()
        }
        return Option.some(Message.Closed({ restingInputValue, isClearable: !isReadOnly }))
      }),
      Match.whenOr('Home', 'End', () => {
        if (!isOpen) {
          return Option.none()
        }

        if (Array.isReadonlyArrayEmpty(items)) {
          return Option.some(Message.SuppressedEmptyItemNavigation())
        }

        const targetIndex = resolveActiveIndex(key)
        return Option.some(
          Message.ActivatedItem({
            index: targetIndex,
            activationTrigger: 'Keyboard',
            maybeImmediateSelection: resolveImmediateSelection(targetIndex),
          }),
        )
      }),
      Match.orElse(() => Option.none()),
    )

  const maybeActiveDescendant = Option.match(maybeValidActiveItemIndex, {
    onNone: () => [],
    onSome: index => [h.AriaActiveDescendant(itemId(id, index))],
  })

  const onInputAttributes = isReadOnly
    ? []
    : [h.OnInput(value => Message.UpdatedInputValue({ value }))]

  const input: ReadonlyArray<ChildAttribute> = childAttributes([
    h.Id(`${id}-input`),
    h.Role('combobox'),
    h.AriaExpanded(isItemsPanelVisible),
    ...(isItemsPanelVisible ? [h.AriaControls(`${id}-items`)] : []),
    h.Attribute('aria-autocomplete', 'list'),
    h.Attribute('aria-haspopup', 'listbox'),
    ...inputLabelAttributes,
    h.Autocomplete('off'),
    h.Value(model.inputValue),
    ...(isItemsPanelVisible ? maybeActiveDescendant : []),
    ...(inputPlaceholder ? [h.Placeholder(inputPlaceholder)] : []),
    ...(isDisabled
      ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
      : [
          ...onInputAttributes,
          h.OnKeyDownPreventDefault(handleInputKeyDown),
          h.OnBlur(
            Message.BlurredInput({
              restingInputValue,
              isClearable: !isReadOnly,
            }),
          ),
          ...(openOnFocus
            ? [h.OnFocus(Message.Opened({ maybeActiveItemIndex: Option.none() }))]
            : []),
        ]),
    ...(isReadOnly
      ? [h.Readonly(true), h.AriaReadonly(true), h.DataAttribute('readonly', '')]
      : []),
    ...(isInvalid ? [h.AriaInvalid(true), h.DataAttribute('invalid', '')] : []),
    ...(isVisible ? [h.DataAttribute('open', '')] : []),
    ...(model.selectInputOnFocus
      ? [h.OnMount(UpstreamCombobox.AttachComboboxSelectOnFocus())]
      : []),
    ...(inputClassName ? [h.Class(inputClassName)] : []),
    ...inputAttributes,
  ])

  const anchorAttributes = [
    h.Style({ position: 'absolute', margin: '0', visibility: 'hidden' }),
    h.OnMount(
      UpstreamCombobox.AnchorCombobox({
        buttonId: `${id}-input-wrapper`,
        anchor,
      }),
    ),
  ]

  const inputWrapper: ReadonlyArray<ChildAttribute> = childAttributes([
    h.Id(`${id}-input-wrapper`),
    ...(inputWrapperClassName ? [h.Class(inputWrapperClassName)] : []),
    ...inputWrapperAttributes,
  ])

  const wrapper: ReadonlyArray<ChildAttribute> = childAttributes([
    ...(className ? [h.Class(className)] : []),
    ...attributes,
    ...(isVisible ? [h.DataAttribute('open', '')] : []),
    ...(isDisabled ? [h.DataAttribute('disabled', '')] : []),
    ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
    ...(isInvalid ? [h.DataAttribute('invalid', '')] : []),
  ])

  const toggleButton =
    buttonContent === undefined
      ? undefined
      : {
          key: `${id}-button`,
          attributes: childAttributes([
            h.Id(`${id}-button`),
            h.Type('button'),
            h.Tabindex(-1),
            ...(isItemsPanelVisible ? [h.AriaControls(`${id}-items`)] : []),
            h.AriaExpanded(isItemsPanelVisible),
            h.Attribute('aria-haspopup', 'listbox'),
            ...(isDisabled
              ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
              : [
                  h.OnClick(
                    Message.PressedToggleButton({
                      restingInputValue,
                      isClearable: !isReadOnly,
                    }),
                  ),
                ]),
            ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
            h.OnMount(UpstreamCombobox.AttachComboboxPreventBlur()),
            ...(buttonClassName ? [h.Class(buttonClassName)] : []),
            ...buttonAttributes,
          ]),
          content: buttonContent,
        }

  if (!isVisible) {
    return {
      id,
      isVisible,
      wrapper,
      inputWrapper,
      input,
      toggleButton,
      backdrop: undefined,
      items: undefined,
      scroll: undefined,
      groups: [],
      hiddenInputs: [],
    }
  }

  const backdrop = isBackdropVisible
    ? {
        key: `${id}-backdrop`,
        attributes: childAttributes([
          h.Id(`${id}-backdrop`),
          h.OnMount(UpstreamCombobox.PortalComboboxBackdrop()),
          ...(isLeaving
            ? []
            : [h.OnClick(Message.Closed({ restingInputValue, isClearable: !isReadOnly }))]),
          ...(backdropClassName ? [h.Class(backdropClassName)] : []),
          ...backdropAttributes,
        ]),
      }
    : undefined

  const itemsContainer = isItemsPanelVisible
    ? {
        key: `${id}-items-container`,
        attributes: childAttributes([
          h.Id(`${id}-items`),
          h.Role('listbox'),
          ...(behavior.ariaMultiSelectable ? [h.AriaMultiSelectable(true)] : []),
          h.AriaLabelledBy(`${id}-input`),
          h.Tabindex(-1),
          ...(isReadOnly ? [h.AriaReadonly(true), h.DataAttribute('readonly', '')] : []),
          ...anchorAttributes,
          ...animationAttributes,
          ...(itemsClassName ? [h.Class(itemsClassName)] : []),
          ...itemsAttributes,
        ]),
      }
    : undefined

  const scroll =
    itemsScrollClassName || Array.isReadonlyArrayNonEmpty(itemsScrollAttributes)
      ? childAttributes([
          ...(itemsScrollClassName ? [h.Class(itemsScrollClassName)] : []),
          ...itemsScrollAttributes,
        ])
      : undefined

  const itemRenders: ReadonlyArray<ComboboxItemRender> = Array.map(items, (item, index) => {
    const isActiveItem = Option.exists(maybeActiveItemIndex, activeIndex => activeIndex === index)
    const isDisabledItem = isDisabledAtIndex(index)
    const isSelectedItem = isValueSelected(itemToValue(item, index))
    const itemConfig: ItemConfig = itemToConfig(item, {
      isActive: isActiveItem,
      isDisabled: isDisabledItem,
      isReadOnly,
      isSelected: isSelectedItem,
    })

    const isHoverable = !isDisabledItem && !isLeaving
    const isClickable = isHoverable && !isReadOnly

    return {
      key: itemId(id, index),
      attributes: childAttributes([
        h.Id(itemId(id, index)),
        h.Role('option'),
        h.AriaSelected(isSelectedItem),
        ...(isActiveItem ? [h.DataAttribute('active', '')] : []),
        ...(isSelectedItem ? [h.DataAttribute('selected', '')] : []),
        ...(isDisabledItem ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')] : []),
        ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
        ...(isClickable
          ? [
              h.OnClick(
                Message.SelectedItem({
                  item: itemToValue(item, index),
                  displayText: itemToDisplayText(item, index),
                  wasSelected: isValueSelected(itemToValue(item, index)),
                }),
              ),
            ]
          : []),
        ...(isHoverable
          ? [
              ...(isActiveItem
                ? []
                : [
                    h.OnPointerMove((screenX, screenY, pointerType) =>
                      when(
                        pointerType !== 'touch',
                        Message.MovedPointerOverItem({ index, screenX, screenY }),
                      ),
                    ),
                  ]),
              h.OnPointerLeave(pointerType =>
                when(pointerType !== 'touch', Message.DeactivatedItem()),
              ),
            ]
          : []),
        ...(itemConfig.className ? [h.Class(itemConfig.className)] : []),
      ]),
      content: itemConfig.content,
    }
  })

  const groups: ReadonlyArray<ComboboxGroupRender> = itemGroupKey
    ? Array.flatMap(
        groupContiguous(itemRenders, (_render, index) =>
          Array.get(items, index).pipe(
            Option.match({
              onNone: () => '',
              onSome: item => itemGroupKey(item, index),
            }),
          ),
        ),
        (segment, segmentIndex) => {
          const maybeHeading = Option.fromNullishOr(groupToHeading?.(segment.key))

          const headingId = `${id}-heading-${segment.key}`

          const heading: ComboboxHeadingRender | undefined = Option.match(maybeHeading, {
            onNone: () => undefined,
            onSome: (headingValue: GroupHeading) => ({
              id: headingId,
              attributes: childAttributes([
                h.Id(headingId),
                h.Role('presentation'),
                ...(headingValue.className ? [h.Class(headingValue.className)] : []),
              ]),
              content: headingValue.content,
            }),
          })

          return [
            {
              key: `${id}-group-${segment.key}`,
              heading,
              group: {
                key: `${id}-group-${segment.key}`,
                attributes: childAttributes([
                  h.Role('group'),
                  ...(heading ? [h.AriaLabelledBy(headingId)] : []),
                  ...(groupClassName ? [h.Class(groupClassName)] : []),
                  ...groupAttributes,
                ]),
              },
              separator:
                segmentIndex > 0 &&
                (separatorClassName || Array.isReadonlyArrayNonEmpty(separatorAttributes))
                  ? {
                      key: `${id}-separator-${segmentIndex}`,
                      attributes: childAttributes([
                        h.Role('separator'),
                        ...(separatorClassName ? [h.Class(separatorClassName)] : []),
                        ...separatorAttributes,
                      ]),
                    }
                  : undefined,
              items: segment.items,
            },
          ]
        },
      )
    : [
        {
          key: `${id}-group`,
          heading: undefined,
          group: undefined,
          separator: undefined,
          items: itemRenders,
        },
      ]

  const hiddenInputs: ReadonlyArray<Html> = formName
    ? Array.match(selectedValues, {
        onEmpty: () => [h.input([h.Type('hidden'), h.Name(formName)])],
        onNonEmpty: Array.map(selectedValue =>
          h.input([h.Type('hidden'), h.Name(formName), h.Value(selectedValue)]),
        ),
      })
    : []

  return {
    id,
    isVisible,
    wrapper,
    inputWrapper,
    input,
    toggleButton,
    backdrop,
    items: itemsContainer,
    scroll,
    groups,
    hiddenInputs,
  }
}

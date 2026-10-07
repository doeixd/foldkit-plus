/**
 * Listbox views with the consumer `toView` seam `@foldkit/ui/listbox` does
 * not expose. State, Messages, update, Commands, Mounts, and subscriptions
 * stay upstream: `create`/`Multi.create` bind the upstream bundles for the
 * item/value pair and swap in only markup assembly, transcribed from
 * `@foldkit/ui@0.165.0` (`packages/ui/src/listbox/shared.ts`,
 * `single.ts`, `multi.ts`; MIT (c) 2025 Devin Jameson) at tag
 * `@foldkit/ui@0.165.0`, with the computed bundles named
 * (`ListboxRenderInfo`) and handed to `toView`.
 *
 * The single and multi Models are structurally identical (both spread the
 * same base fields), so one shared transcription serves both variants; the
 * single adaptor maps `maybeSelectedValue` to `selectedValues` exactly as
 * upstream's does. The default `toView` reproduces upstream's markup; the
 * parity battery draws all three views over the same models, so drift fails
 * loudly. If upstream gains a seam, delete this module; on a bump,
 * re-transcribe and re-run the battery.
 */
import { Array, Match, Option, Predicate, String, pipe } from 'effect'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import { Message } from '@foldkit/ui/listbox'
import type { Model as SingleModel } from '@foldkit/ui/listbox'
import type {
  BaseViewInputsCommon,
  GroupHeading,
  ItemConfig,
  ItemToValueInput,
} from '@foldkit/ui/listbox'
import {
  childAttributes,
  type ChildAttribute,
  type Html,
  type HtmlBuilder,
} from 'foldkit/html'
import { defineView, type View as SubmodelView } from 'foldkit/submodel'
import {
  findFirstEnabledIndex,
  groupContiguous,
  isPrintableKey,
  keyToIndex,
  resolveTypeaheadMatch,
  whenOption as when,
} from './menuUtils.js'

/** One listbox item's bundle: element key, attributes, and caller content. */
export type ListboxItemRender = Readonly<{
  key: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

/** A heading element's bundle, present only when the group names one. */
export type ListboxHeadingRender = Readonly<{
  id: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

/** One rendered group; `group` is undefined for the ungrouped pass-through. */
export type ListboxGroupRender = Readonly<{
  key: string
  heading: ListboxHeadingRender | undefined
  group: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  separator:
    | { key: string; attributes: ReadonlyArray<ChildAttribute> }
    | undefined
  items: ReadonlyArray<ListboxItemRender>
}>

/**
 * The listbox's computed bundles. `backdrop`, `items`, `scroll`, and
 * `groups` are present only while visible; a closed listbox carries the rest
 * alone, as upstream renders it. `hiddenInputs` are the form inputs
 * submitted under `name`, passed through for the draw to place.
 */
export type ListboxRenderInfo = Readonly<{
  id: string
  isVisible: boolean
  wrapper: ReadonlyArray<ChildAttribute>
  button: ReadonlyArray<ChildAttribute>
  buttonContent: Html
  hiddenInputs: ReadonlyArray<Html>
  backdrop:
    | { key: string; attributes: ReadonlyArray<ChildAttribute> }
    | undefined
  items: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  scroll: ReadonlyArray<ChildAttribute> | undefined
  groups: ReadonlyArray<ListboxGroupRender>
}>

const itemId = (id: string, index: number): string => `${id}-item-${index}`

export type SharedBehavior = Readonly<{ ariaMultiSelectable: boolean }>

/** Normalized inputs: the multi shape both variants lower into, built from
 *  upstream's own pieces so field additions there flow through. */
export type NormalizedInputs<Item, Value extends string> = BaseViewInputsCommon<Item> &
  Readonly<{ selectedValues: ReadonlyArray<Value> }> &
  ItemToValueInput<Item, Value>

export type SharedViewInputs = NormalizedInputs<unknown, string> & {
  toView?: ((render: ListboxRenderInfo) => Html) | undefined
}

export const computeRender = (
  model: SingleModel,
  viewInputs: NormalizedInputs<unknown, string>,
  h: HtmlBuilder<Message>,
  behavior: SharedBehavior,
): ListboxRenderInfo => {
  const {
    id,
    isOpen,
    orientation,
    animation: { transitionState },
    maybeActiveItemIndex,
    searchQuery,
    maybeLastButtonPointerType,
  } = model

  const {
    items,
    itemToConfig,
    isItemDisabled,
    isButtonDisabled,
    buttonContent,
    buttonClassName,
    buttonAttributes = [],
    itemsClassName,
    itemsAttributes = [],
    itemsScrollClassName,
    itemsScrollAttributes = [],
    backdropClassName,
    backdropAttributes = [],
    className,
    attributes = [],
    itemGroupKey,
    groupToHeading,
    groupClassName,
    groupAttributes = [],
    separatorClassName,
    separatorAttributes = [],
    anchor = {},
    name,
    form,
    isDisabled,
    isReadOnly = false,
    isInvalid,
    ariaLabel,
    ariaLabelledBy,
    selectedValues,
  } = viewInputs

  const itemToValue =
    viewInputs.itemToValue ?? ((item: unknown) => globalThis.String(item))
  const isValueSelected = (itemValue: string): boolean =>
    Array.contains(selectedValues, itemValue)
  const itemToSearchText =
    viewInputs.itemToSearchText ?? ((item: unknown) => itemToValue(item))

  const isLeaving =
    transitionState === 'LeaveStart' || transitionState === 'LeaveAnimating'
  const isVisible = isOpen || isLeaving

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

  const isItemDisabledByIndex = (index: number): boolean =>
    Predicate.isNotUndefined(isItemDisabled) &&
    pipe(
      items,
      Array.get(index),
      Option.exists(item => isItemDisabled(item, index)),
    )

  const isButtonEffectivelyDisabled = isDisabled || isButtonDisabled

  const nextKey = orientation === 'Horizontal' ? 'ArrowRight' : 'ArrowDown'
  const previousKey = orientation === 'Horizontal' ? 'ArrowLeft' : 'ArrowUp'

  const navigationKeys = [nextKey, previousKey, 'Home', 'End', 'PageUp', 'PageDown']
  const isNavigationKey = (key: string): boolean => Array.contains(navigationKeys, key)

  const firstEnabledIndex = findFirstEnabledIndex(items.length, 0, isItemDisabledByIndex)(
    0,
    1,
  )

  const lastEnabledIndex = findFirstEnabledIndex(items.length, 0, isItemDisabledByIndex)(
    items.length - 1,
    -1,
  )

  const selectedItemIndex = pipe(
    selectedValues,
    Array.head,
    Option.flatMap(selectedValue =>
      Array.findFirstIndex(items, item => itemToValue(item) === selectedValue),
    ),
  )

  const handleButtonKeyDown = (key: string): Option.Option<Message> => {
    if (isOpen) {
      return handleItemsKeyDown(key)
    }

    return Match.value(key).pipe(
      Match.whenOr('Enter', ' ', 'ArrowDown', () =>
        Option.some(
          Message.Opened({
            maybeActiveItemIndex: Option.orElse(selectedItemIndex, () =>
              Option.some(firstEnabledIndex),
            ),
          }),
        ),
      ),
      Match.when('ArrowUp', () =>
        Option.some(
          Message.Opened({
            maybeActiveItemIndex: Option.orElse(selectedItemIndex, () =>
              Option.some(lastEnabledIndex),
            ),
          }),
        ),
      ),
      Match.orElse(() => Option.none()),
    )
  }

  const handleButtonPointerDown = (
    pointerType: string,
    button: number,
  ): Option.Option<Message> =>
    Option.some(Message.PressedPointerOnButton({ pointerType, button }))

  const handleButtonClick = (): Message => {
    const isMouse = Option.exists(
      maybeLastButtonPointerType,
      type => type === 'mouse',
    )

    if (isMouse) {
      return Message.IgnoredMouseClick()
    } else if (isOpen) {
      return Message.Closed()
    } else {
      return Message.Opened({ maybeActiveItemIndex: Option.none() })
    }
  }

  const handleSpaceKeyUp = (key: string): Option.Option<Message> =>
    when(key === ' ', Message.SuppressedSpaceScroll())

  const resolveActiveIndex = (key: string): number =>
    Option.match(maybeActiveItemIndex, {
      onNone: () =>
        Match.value(key).pipe(
          Match.whenOr(previousKey, 'End', 'PageDown', () => lastEnabledIndex),
          Match.orElse(() => firstEnabledIndex),
        ),
      onSome: activeIndex =>
        keyToIndex(nextKey, previousKey, items.length, activeIndex, isItemDisabledByIndex)(
          key,
        ),
    })

  const searchForKey = (key: string): Option.Option<Message> => {
    const nextQuery = searchQuery + key
    const maybeTargetIndex = resolveTypeaheadMatch(
      items,
      nextQuery,
      maybeActiveItemIndex,
      isItemDisabledByIndex,
      itemToSearchText,
      String.isNonEmpty(searchQuery),
    )
    return Option.some(Message.Searched({ key, maybeTargetIndex }))
  }

  const resolveCommitMessage = (): Option.Option<Message> => {
    if (isReadOnly) {
      return Option.as(maybeActiveItemIndex, Message.SuppressedItemCommit())
    } else {
      return Option.map(maybeActiveItemIndex, index =>
        Message.RequestedItemClick({ index }),
      )
    }
  }

  const handleItemsKeyDown = (key: string): Option.Option<Message> =>
    Match.value(key).pipe(
      Match.when('Escape', () => Option.some(Message.Closed())),
      Match.when('Enter', resolveCommitMessage),
      Match.when(' ', () =>
        String.isNonEmpty(searchQuery) ? searchForKey(' ') : resolveCommitMessage(),
      ),
      Match.when(isNavigationKey, () =>
        Option.some(
          Message.ActivatedItem({
            index: resolveActiveIndex(key),
            activationTrigger: 'Keyboard',
          }),
        ),
      ),
      Match.when(isPrintableKey, () => searchForKey(key)),
      Match.orElse(() => Option.none()),
    )

  const resolveButtonLabel = () => {
    if (Predicate.isNotUndefined(ariaLabel)) {
      return [h.AriaLabel(ariaLabel)]
    } else if (Predicate.isNotUndefined(ariaLabelledBy)) {
      return [h.AriaLabelledBy(ariaLabelledBy)]
    } else {
      return []
    }
  }

  const button: ReadonlyArray<ChildAttribute> = childAttributes([
    h.Id(`${id}-button`),
    h.Type('button'),
    h.AriaHasPopup('listbox'),
    h.AriaExpanded(isVisible),
    ...(isVisible ? [h.AriaControls(`${id}-items`)] : []),
    ...resolveButtonLabel(),
    ...(isButtonEffectivelyDisabled
      ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
      : [
          h.OnPointerDown(handleButtonPointerDown),
          h.OnKeyDownPreventDefault(handleButtonKeyDown),
          h.OnKeyUpPreventDefault(handleSpaceKeyUp),
          h.OnClick(handleButtonClick()),
        ]),
    ...(isVisible
      ? [h.DataAttribute('open', ''), h.Style({ position: 'relative', zIndex: '1' })]
      : []),
    ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
    ...(isInvalid ? [h.DataAttribute('invalid', '')] : []),
    ...(buttonClassName ? [h.Class(buttonClassName)] : []),
    ...buttonAttributes,
  ])

  const maybeActiveDescendant = Option.match(maybeActiveItemIndex, {
    onNone: () => [],
    onSome: index => [h.AriaActiveDescendant(itemId(id, index))],
  })

  const anchorAttributes = [
    h.Style({ position: 'absolute', margin: '0', visibility: 'hidden' }),
    h.OnMount(
      UpstreamListbox.AnchorListbox({ buttonId: `${id}-button`, anchor }),
    ),
  ]

  const wrapper: ReadonlyArray<ChildAttribute> = childAttributes([
    ...(className ? [h.Class(className)] : []),
    ...attributes,
    ...(isVisible ? [h.DataAttribute('open', '')] : []),
    ...(isDisabled ? [h.DataAttribute('disabled', '')] : []),
    ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
    ...(isInvalid ? [h.DataAttribute('invalid', '')] : []),
  ])

  if (!isVisible) {
    return {
      id,
      isVisible,
      wrapper,
      button,
      buttonContent,
      hiddenInputs: [],
      backdrop: undefined,
      items: undefined,
      scroll: undefined,
      groups: [],
    }
  }

  const backdrop = {
    key: `${id}-backdrop`,
    attributes: childAttributes([
      h.OnMount(UpstreamListbox.PortalListboxBackdrop()),
      ...(isLeaving ? [] : [h.OnClick(Message.Closed())]),
      ...(backdropClassName ? [h.Class(backdropClassName)] : []),
      ...backdropAttributes,
    ]),
  }

  const itemsContainer = {
    key: `${id}-items-container`,
    attributes: childAttributes([
      h.Id(`${id}-items`),
      h.Role('listbox'),
      h.AriaOrientation(String.toLowerCase(orientation)),
      ...(behavior.ariaMultiSelectable ? [h.AriaMultiSelectable(true)] : []),
      ...(isReadOnly ? [h.AriaReadonly(true), h.DataAttribute('readonly', '')] : []),
      h.AriaLabelledBy(`${id}-button`),
      ...maybeActiveDescendant,
      h.Tabindex(-1),
      ...anchorAttributes,
      ...animationAttributes,
      ...(isLeaving
        ? []
        : [
            h.OnKeyDownPreventDefault(handleItemsKeyDown),
            h.OnKeyUpPreventDefault(handleSpaceKeyUp),
            h.OnBlur(Message.BlurredItems()),
          ]),
      ...(itemsClassName ? [h.Class(itemsClassName)] : []),
      ...itemsAttributes,
    ]),
  }

  const scroll =
    itemsScrollClassName || Array.isReadonlyArrayNonEmpty(itemsScrollAttributes)
      ? childAttributes([
          ...(itemsScrollClassName ? [h.Class(itemsScrollClassName)] : []),
          ...itemsScrollAttributes,
        ])
      : undefined

  const itemRenders: ReadonlyArray<ListboxItemRender> = Array.map(
    items,
    (item, index) => {
      const isActiveItem = Option.exists(
        maybeActiveItemIndex,
        activeIndex => activeIndex === index,
      )
      const isDisabledItem = isItemDisabledByIndex(index)
      const isSelectedItem = isValueSelected(itemToValue(item))
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
          ...(isDisabledItem
            ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
            : []),
          ...(isReadOnly ? [h.DataAttribute('readonly', '')] : []),
          ...(isClickable
            ? [h.OnClick(Message.SelectedItem({ item: itemToValue(item) }))]
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
    },
  )

  const groups: ReadonlyArray<ListboxGroupRender> = itemGroupKey
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
          const maybeHeading = Option.fromNullishOr(
            groupToHeading?.(segment.key),
          )

          const headingId = `${id}-heading-${segment.key}`

          const heading: ListboxHeadingRender | undefined = Option.match(
            maybeHeading,
            {
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
            },
          )

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
                (separatorClassName ||
                  Array.isReadonlyArrayNonEmpty(separatorAttributes))
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

  const formAttribute = form ? [h.Attribute('form', form)] : []

  const hiddenInputs: ReadonlyArray<Html> = name
    ? Array.match(selectedValues, {
        onEmpty: () => [h.input([h.Type('hidden'), h.Name(name), ...formAttribute])],
        onNonEmpty: Array.map(selectedValue =>
          h.input([
            h.Type('hidden'),
            h.Name(name),
            h.Value(selectedValue),
            ...formAttribute,
          ]),
        ),
      })
    : []

  return {
    id,
    isVisible,
    wrapper,
    button,
    buttonContent,
    hiddenInputs,
    backdrop,
    items: itemsContainer,
    scroll,
    groups,
  }
}

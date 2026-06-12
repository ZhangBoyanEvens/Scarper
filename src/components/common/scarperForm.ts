import type { CSSProperties } from 'react'
import type { SelectProps } from 'antd'

/** Mount dropdowns on body so overflow:hidden toolbars do not clip options. */
export function scarperSelectPopup(): HTMLElement {
  return document.body
}

export const SCARPER_SELECT_STYLE: CSSProperties = {
  minWidth: 160,
  maxWidth: 280,
}

export const SCARPER_SELECT_WIDE: CSSProperties = {
  minWidth: 200,
  maxWidth: 320,
}

export function scarperSelectProps(
  style: CSSProperties = SCARPER_SELECT_STYLE,
): Pick<SelectProps, 'size' | 'getPopupContainer' | 'style' | 'popupMatchSelectWidth'> {
  return {
    size: 'middle',
    getPopupContainer: scarperSelectPopup,
    style,
    popupMatchSelectWidth: false,
  }
}

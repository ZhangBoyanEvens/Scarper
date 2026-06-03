import {
  useCallback,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react'

interface AutoResizeTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
}

export function AutoResizeTextarea({
  minRows = 2,
  value,
  onChange,
  className,
  ...rest
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const syncHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const style = getComputedStyle(el)
    const lineHeight = Number.parseFloat(style.lineHeight) || 22
    const pad =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom)
    const border =
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth)
    const minH = lineHeight * minRows + pad + border
    el.style.height = `${Math.max(el.scrollHeight, minH)}px`
  }, [minRows])

  useLayoutEffect(() => {
    syncHeight()
  }, [value, syncHeight])

  return (
    <textarea
      ref={ref}
      className={className}
      rows={minRows}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        requestAnimationFrame(syncHeight)
      }}
      {...rest}
    />
  )
}

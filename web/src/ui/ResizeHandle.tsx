import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

export interface ResizeHandleProps {
  /** "vertical" divides side by side (drag left/right); "horizontal" stacks (drag up/down). */
  orientation: 'vertical' | 'horizontal'
  label: string
  value: number
  min: number
  max: number
  /** Turns the pointer's travel since the drag started into the new size. */
  onResize: (size: number) => void
  /** Pixels the size grows per pixel of travel: -1 when dragging left grows the size. */
  direction?: 1 | -1
  /** Double-click or Home: back to the automatic size. */
  onReset?: () => void
  className?: string
  /** The size actually on screen when a drag starts, if `value` may not reflect it. */
  measure?: () => number | undefined
}

const STEP = 20

/** A draggable divider, also usable with the arrow keys. */
export function ResizeHandle({ orientation, label, value, min, max, onResize, direction = 1, onReset, className, measure }: ResizeHandleProps) {
  const start = useRef<{ pos: number; size: number } | null>(null)
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)))
  const pos = (e: PointerEvent) => (orientation === 'vertical' ? e.clientX : e.clientY)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { pos: pos(e), size: measure?.() ?? value }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    onResize(clamp(start.current.size + direction * (pos(e) - start.current.pos)))
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    start.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grow = orientation === 'vertical' ? (direction === 1 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowDown'
    const shrink = orientation === 'vertical' ? (direction === 1 ? 'ArrowLeft' : 'ArrowRight') : 'ArrowUp'
    const now = measure?.() ?? value
    if (e.key === grow) onResize(clamp(now + STEP))
    else if (e.key === shrink) onResize(clamp(now - STEP))
    else if (e.key === 'Home' && onReset) onReset()
    else return
    e.preventDefault()
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`resize-handle resize-${orientation}${className ? ` ${className}` : ''}`}
      title={`${label}: drag, or use the arrow keys${onReset ? '; double-click to reset' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}

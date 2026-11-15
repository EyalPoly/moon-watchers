import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** A field explanation that opens on activation, including Enter or Space. */
export function FieldHelp({ field, children, symbol = '?' }: { field: string; children: ReactNode; symbol?: string }) {
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const tip = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!button.current || !tip.current) return
      const anchor = button.current.getBoundingClientRect()
      const box = tip.current.getBoundingClientRect()
      setPosition({
        left: Math.max(8, Math.min(anchor.left - 8, window.innerWidth - box.width - 8)),
        top: anchor.bottom + box.height + 8 <= window.innerHeight ? anchor.bottom + 5 : Math.max(8, anchor.top - box.height - 5),
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !tip.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <span className="field-help" ref={root}>
      <button type="button" className="help-trigger" ref={button} aria-label={`Help for ${field}`}
        aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)}>{symbol}</button>
      {open && createPortal(<span id={id} ref={tip} className="help-text" role="tooltip" style={position}>{children}</span>, document.body)}
    </span>
  )
}

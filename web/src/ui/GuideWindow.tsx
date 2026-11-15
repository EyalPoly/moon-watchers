import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

function HelmetIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M24 2.3a20.8 20.8 0 1 1-10.7 38.7L4.4 45l2.9-9.1A20.8 20.8 0 0 1 24 2.3Z"
        fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <g fill="#c4d2c8">
        <rect x="9.2" y="20" width="4" height="9" rx="1.8" />
        <rect x="34.8" y="20" width="4" height="9" rx="1.8" />
        <path d="M24 9c7.7 0 12.7 6.9 12.7 15.2 0 7.6-5.6 11.6-12.7 11.6s-12.7-4-12.7-11.6C11.3 15.9 16.3 9 24 9Z" />
        <rect x="14.1" y="35.2" width="19.8" height="2.8" rx="1.4" />
      </g>
      <path d="M13.6 21c1-5.3 19.8-5.3 20.8 0 1.4 7.6-3.4 12.1-10.4 12.1S12.2 28.6 13.6 21Z" fill="#101b18" />
      <path d="M14.4 25.4q9.6-5 19.2 0-9.6-3.1-19.2 0Z" fill="currentColor" />
    </svg>
  )
}

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
}

export function GuideWindow({ open, setOpen, children, settingsControl }: {
  open: boolean; setOpen: (open: boolean) => void; children: ReactNode; settingsControl?: ReactNode
}) {
  const [minimized, setMinimized] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const dialogId = useId()
  const titleId = useId()

  useLayoutEffect(() => {
    if (open && !minimized) {
      panel.current?.querySelector<HTMLElement>('textarea, input[type=password]')?.focus({ preventScroll: true })
    }
  }, [open, minimized])

  const close = () => {
    setOpen(false)
    setMinimized(false)
    drag.current = null
    launcher.current?.focus({ preventScroll: true })
  }
  const move = (x: number, y: number) => {
    if (!panel.current) return
    const { width, height } = panel.current.getBoundingClientRect()
    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, x)),
      y: Math.max(8, Math.min(window.innerHeight - height - 8, y)),
    })
  }

  return <>
    <button ref={launcher} type="button" className="guide-launcher" aria-label="Ask the AI guide"
      title="Ask the AI guide" aria-haspopup="dialog" aria-expanded={open && !minimized}
      aria-controls={open ? dialogId : undefined}
      onClick={() => { if (open && !minimized) close(); else { setOpen(true); setMinimized(false) } }}>
      <HelmetIcon />
    </button>
    {open && <div ref={panel} role="dialog" id={dialogId} aria-labelledby={titleId} className="guide"
      data-minimized={minimized}
      style={position ? { '--guide-x': `${position.x}px`, '--guide-y': `${position.y}px` } as CSSProperties : undefined}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
      <header className="guide-head">
        <h2 className="guide-title" id={titleId}>AI Guide</h2>
        {!minimized && settingsControl}
        <button type="button" className="guide-control guide-move" aria-label="Move the AI guide"
          title="Move window · drag or use arrow keys"
          onPointerDown={(e) => {
            if (e.button !== 0 || !e.isPrimary || !panel.current) return
            const rect = panel.current.getBoundingClientRect()
            drag.current = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const start = drag.current
            if (start?.id === e.pointerId) move(e.clientX - start.dx, e.clientY - start.dy)
          }}
          onLostPointerCapture={() => { drag.current = null }}
          onKeyDown={(e) => {
            const delta = MOVE_KEYS[e.key]
            if (!delta || !panel.current) return
            e.preventDefault()
            const rect = panel.current.getBoundingClientRect()
            move(rect.left + delta[0], rect.top + delta[1])
          }}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v13m-6.5-6.5h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2" /></svg>
        </button>
        <button type="button" className="guide-control" aria-label={minimized ? 'Restore the AI guide' : 'Minimize the AI guide'}
          title={minimized ? 'Restore' : 'Minimize'} onClick={() => setMinimized(!minimized)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">{minimized
            ? <rect x="3" y="3" width="10" height="10" rx="1" /> : <path d="M3 10.5h10" />}</svg>
        </button>
        <button type="button" className="guide-control" aria-label="Close the AI guide" title="Close" onClick={close}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 3.5 9 9m0-9-9 9" /></svg>
        </button>
      </header>
      <div className="guide-content" hidden={minimized}>{children}</div>
    </div>}
  </>
}

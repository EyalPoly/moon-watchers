import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatUtc, missionClock } from '../time'

export interface TimeSliderProps {
  /** Mission elapsed time in minutes, a multiple of 10. */
  tau: number
  maxTau: number
  landingMs: number
  /** Called on every step while dragging or playing. */
  onInput: (tau: number) => void
  /** Called once when a drag ends or playback stops, to commit the value. */
  onCommit: (tau: number) => void
}

/** Playback speed: 6 hours of mission time per second. */
const PLAY_MIN_PER_S = 360

export function TimeSlider({ tau, maxTau, landingMs, onInput, onCommit }: TimeSliderProps) {
  const [playing, setPlaying] = useState(false)
  // The playback loop reads the latest values without restarting on every frame.
  const tauRef = useRef(tau)
  const handlers = useRef({ onInput, onCommit })
  useLayoutEffect(() => {
    tauRef.current = tau
    handlers.current = { onInput, onCommit }
  })

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    let carry = 0
    const tick = (now: number) => {
      carry += ((now - last) / 1000) * PLAY_MIN_PER_S
      last = now
      const steps = Math.floor(carry / 10)
      if (steps > 0) {
        carry -= steps * 10
        const next = Math.min(maxTau, tauRef.current + steps * 10)
        handlers.current.onInput(next)
        if (next >= maxTau) {
          setPlaying(false)
          handlers.current.onCommit(next)
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, maxTau])

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      onCommit(tauRef.current)
      return
    }
    if (tau >= maxTau) onInput(0)
    setPlaying(true)
  }

  return (
    <div className="time-slider">
      <div className="time-track">
        <input
          type="range"
          min={0}
          max={maxTau}
          step={10}
          value={tau}
          aria-label="Mission time"
          aria-valuetext={`${missionClock(tau)}, ${formatUtc(landingMs + tau * 60_000)}`}
          onChange={(e) => onInput(Number(e.target.value))}
          onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        />
        <div className="time-readout">
          <span className="num">{missionClock(tau)}</span>
          <span className="num muted">{formatUtc(landingMs + tau * 60_000)}</span>
        </div>
      </div>
      <button
        type="button"
        className="icon-button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play (6 h per second)'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { MAX_NAME_LENGTH, cleanName } from '../state/tickets'

export interface TicketNameProps {
  name: string
  /** Shown while the ticket has no name, e.g. "Ticket 2". */
  placeholder: string
  onChange: (name: string) => void
}

/** The ticket's name: saved when the field loses focus or on Enter; Escape undoes the edit. */
export function TicketName({ name, placeholder, onChange }: TicketNameProps) {
  const [draft, setDraft] = useState(name)
  const commit = () => {
    const next = cleanName(draft)
    setDraft(next)
    if (next !== name) onChange(next)
  }
  return (
    <label className="ticket-name">
      <span className="control-caption">Ticket name</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(name)
        }}
        aria-label="Ticket name"
      />
    </label>
  )
}

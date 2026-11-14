/** A small loading line: spinner and label. */
export function Pending({ label }: { label: string }) {
  return (
    <div className="pending" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  )
}

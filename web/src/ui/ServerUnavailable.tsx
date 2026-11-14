export function ServerUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="server-unavailable">
      <p>Server unavailable</p>
      <button type="button" className="primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

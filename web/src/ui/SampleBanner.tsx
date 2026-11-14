export function SampleBanner({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div role="status" className="sample-banner">
      Sample data
    </div>
  )
}

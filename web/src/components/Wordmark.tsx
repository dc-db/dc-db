export function Wordmark() {
  return (
    <span className="wordmark" role="img" aria-label="DC-DB">
      <svg className="wordmark-symbol" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <use href="/brand/mark.svg?v=server-1#dc-db-symbol" />
      </svg>
      <span className="wordmark-text" aria-hidden="true">DC-DB</span>
    </span>
  )
}

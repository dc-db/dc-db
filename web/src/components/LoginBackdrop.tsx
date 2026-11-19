/**
 * Decorative backdrop for the sign-in page: a soft three-colour glow on a
 * faint grid. Colours come from CSS variables so light and dark themes share
 * the same drawing.
 */
export function LoginBackdrop() {
  const columns = Array.from({ length: 19 }, (_, index) => index * 80)
  const rows = Array.from({ length: 12 }, (_, index) => index * 80)

  return (
    <svg
      className="login-backdrop" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" focusable="false"
    >
      <defs>
        <radialGradient id="login-glow-a">
          <stop offset="0%" stopColor="var(--login-glow-a)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--login-glow-a)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="login-glow-b">
          <stop offset="0%" stopColor="var(--login-glow-b)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--login-glow-b)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="login-glow-c">
          <stop offset="0%" stopColor="var(--login-glow-c)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--login-glow-c)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1440" height="900" fill="var(--login-bg)" />

      <g stroke="var(--login-grid)" strokeWidth="1">
        {columns.map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="900" />)}
        {rows.map(y => <line key={`h${y}`} x1="0" y1={y} x2="1440" y2={y} />)}
      </g>

      <ellipse cx="220" cy="60" rx="640" ry="460" fill="url(#login-glow-a)" />
      <ellipse cx="1250" cy="860" rx="620" ry="460" fill="url(#login-glow-b)" />
      <ellipse cx="780" cy="470" rx="480" ry="340" fill="url(#login-glow-c)" opacity="0.6" />
    </svg>
  )
}

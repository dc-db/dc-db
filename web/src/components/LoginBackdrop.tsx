/**
 * Sign-in backdrop: a near-black page with a faint grid and one wide blue glow
 * rising from the bottom edge. The grid gives the surface some texture without
 * turning it into an illustration.
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
        <linearGradient id="login-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#070b14" />
          <stop offset="100%" stopColor="#03060c" />
        </linearGradient>
        <radialGradient id="login-glow">
          <stop offset="0%" stopColor="#3f7dff" stopOpacity="0.8" />
          <stop offset="45%" stopColor="#1d47b8" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#1d47b8" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1440" height="900" fill="url(#login-base)" />

      <g stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1">
        {columns.map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="900" />)}
        {rows.map(y => <line key={`h${y}`} x1="0" y1={y} x2="1440" y2={y} />)}
      </g>

      <ellipse cx="720" cy="985" rx="1000" ry="580" fill="url(#login-glow)" />
    </svg>
  )
}

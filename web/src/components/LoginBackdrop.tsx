/**
 * Sign-in backdrop: a near-black page with one wide glow rising from the
 * bottom edge. Mirrors the console-style login pages that keep a single warm
 * or cool accent instead of a full illustration.
 */
export function LoginBackdrop() {
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
      <ellipse cx="720" cy="985" rx="1000" ry="580" fill="url(#login-glow)" />
    </svg>
  )
}

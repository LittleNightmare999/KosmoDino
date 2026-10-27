// Плоские пиктограммы категорий, нарисованные кодом в цветах палитры.
// Один графический язык: квадратное поле категории + геометрическая фигура тушью.
const INK = '#1b241e'
const SAGE = '#cfe3c8'
const BEIGE = '#efe6d4'
const PAPER = '#ffffff'

const shapes = {
  stars: (
    <>
      <circle cx="32" cy="32" r="14" fill={INK} />
      <rect x="30" y="6" width="4" height="10" fill={INK} />
      <rect x="30" y="48" width="4" height="10" fill={INK} />
      <rect x="6" y="30" width="10" height="4" fill={INK} />
      <rect x="48" y="30" width="10" height="4" fill={INK} />
    </>
  ),
  planets: (
    <>
      <circle cx="32" cy="32" r="13" fill={INK} />
      <ellipse cx="32" cy="32" rx="25" ry="7" fill="none" stroke={INK} strokeWidth="3" />
      <rect x="19" y="29" width="26" height="3" fill={PAPER} opacity="0.35" />
    </>
  ),
  'small-bodies': (
    <>
      <circle cx="40" cy="24" r="10" fill={INK} />
      <path d="M33 31 L8 56 L14 50 L4 60 L30 40 Z" fill={INK} />
      <circle cx="18" cy="16" r="3" fill={INK} />
    </>
  ),
  galaxies: (
    <>
      <ellipse cx="32" cy="32" rx="26" ry="10" fill={INK} transform="rotate(-25 32 32)" />
      <ellipse cx="32" cy="32" rx="14" ry="5" fill={PAPER} opacity="0.5" transform="rotate(-25 32 32)" />
      <circle cx="32" cy="32" r="4" fill={PAPER} />
    </>
  ),
  missions: (
    <>
      <path d="M32 6 L42 22 L42 44 L22 44 L22 22 Z" fill={INK} />
      <path d="M22 34 L12 48 L22 46 Z M42 34 L52 48 L42 46 Z" fill={INK} />
      <circle cx="32" cy="26" r="4" fill={PAPER} />
      <rect x="27" y="47" width="10" height="9" fill={INK} opacity="0.45" />
    </>
  ),
  periods: (
    <>
      <rect x="6" y="10" width="52" height="10" fill={INK} />
      <rect x="6" y="24" width="52" height="10" fill={INK} opacity="0.65" />
      <rect x="6" y="38" width="52" height="10" fill={INK} opacity="0.35" />
      <rect x="6" y="52" width="52" height="4" fill={INK} />
    </>
  ),
  theropods: (
    <>
      <path d="M10 54 C18 30 30 14 50 8 C40 22 34 36 32 54 Z" fill={INK} />
      <path d="M36 54 C40 40 46 30 56 24 C52 36 50 46 50 54 Z" fill={INK} opacity="0.6" />
    </>
  ),
  sauropodomorphs: (
    <>
      <path d="M8 50 C8 36 18 30 30 30 L46 30 C48 22 48 14 52 10 L58 10 L58 16 L54 16 C52 22 52 34 50 42 L50 54 L44 54 L44 44 L22 44 L22 54 L16 54 L16 46 Z" fill={INK} />
    </>
  ),
  ornithischians: (
    <>
      <path d="M6 48 L58 48 L58 54 L6 54 Z" fill={INK} />
      <path d="M12 46 L18 30 L24 46 Z M24 46 L31 24 L38 46 Z M38 46 L45 30 L52 46 Z" fill={INK} />
    </>
  ),
  paleontology: (
    <>
      <rect x="14" y="28" width="36" height="8" fill={INK} transform="rotate(-35 32 32)" />
      <circle cx="16" cy="40" r="6" fill={INK} />
      <circle cx="22" cy="48" r="6" fill={INK} />
      <circle cx="42" cy="16" r="6" fill={INK} />
      <circle cx="48" cy="24" r="6" fill={INK} />
    </>
  ),
}

const SPACE = new Set(['stars', 'planets', 'small-bodies', 'galaxies', 'missions'])

export default function Glyph({ category, size = 56, className = 'entry-glyph' }) {
  const bg = SPACE.has(category) ? SAGE : BEIGE
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" fill={bg} />
      {shapes[category] || <rect x="20" y="20" width="24" height="24" fill={INK} />}
    </svg>
  )
}

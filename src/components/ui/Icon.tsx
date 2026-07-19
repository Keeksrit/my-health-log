export type IconName =
  | 'stats' | 'today' | 'calendar' | 'meds' | 'nutrition' | 'tests' | 'symptom'
  | 'brand' | 'leaf' | 'pin' | 'copy' | 'camera' | 'download' | 'upload' | 'image' | 'flag'

interface Props {
  name: IconName
  size?: number
  strokeWidth?: number
  filled?: boolean
  className?: string
}

/**
 * Dependency-free stroke icon set. One 24px grid, round caps/joins, currentColor
 * so icons inherit text color (nav-active green, ink, muted). Decorative by
 * default (aria-hidden); label the surrounding control when the icon stands alone.
 */
export default function Icon({ name, size = 20, strokeWidth = 1.75, filled = false, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-0.15em', flexShrink: 0 }}
    >
      {ICONS[name](filled)}
    </svg>
  )
}

const ICONS: Record<IconName, (filled: boolean) => JSX.Element> = {
  stats: () => (
    <>
      <line x1="5" y1="21" x2="19" y2="21" />
      <line x1="7" y1="21" x2="7" y2="13" strokeWidth="2.5" />
      <line x1="12" y1="21" x2="12" y2="8" strokeWidth="2.5" />
      <line x1="17" y1="21" x2="17" y2="15" strokeWidth="2.5" />
    </>
  ),
  today: () => (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
      <line x1="8.5" y1="11" x2="15.5" y2="11" />
      <line x1="8.5" y1="15" x2="13.5" y2="15" />
    </>
  ),
  calendar: () => (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2.5" />
      <line x1="4" y1="9.5" x2="20" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </>
  ),
  meds: () => (
    <g transform="rotate(45 12 12)">
      <rect x="4" y="8.5" width="16" height="7" rx="3.5" />
      <line x1="12" y1="8.5" x2="12" y2="15.5" />
    </g>
  ),
  nutrition: () => (
    <>
      <path d="M12 8.5c-1.4-1.5-3.6-1.7-5.1-.4-1.7 1.5-1.8 4.3-.6 7 1 2.2 2.6 4.1 3.9 4.6 1 .4 1.8-.3 1.8-.3s.8.7 1.8.3c1.3-.5 2.9-2.4 3.9-4.6 1.2-2.7 1.1-5.5-.6-7-1.5-1.3-3.7-1.1-5.1.4z" />
      <path d="M12 8.5V5" />
      <path d="M12 6c1-1.6 2.6-2.2 4-2-.2 1.6-1.4 2.8-3 2.9" />
    </>
  ),
  tests: () => (
    <>
      <path d="M10 3v6.2L5.6 17a2 2 0 0 0 1.7 3h9.4a2 2 0 0 0 1.7-3L14 9.2V3" />
      <line x1="8.5" y1="3" x2="15.5" y2="3" />
      <line x1="8" y1="15" x2="16" y2="15" />
    </>
  ),
  symptom: () => (
    <g transform="rotate(45 12 12)">
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <circle cx="9.6" cy="12" r="0.65" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="12" r="0.65" fill="currentColor" stroke="none" />
    </g>
  ),
  brand: () => (
    <>
      <path d="M12 20.5S4.5 15.6 4.5 9.9A3.9 3.9 0 0 1 12 8.2a3.9 3.9 0 0 1 7.5 1.7c0 5.7-7.5 10.6-7.5 10.6z" />
      <path d="M6 12h2l1.3-2.4L11.5 15l1.4-3H18" />
    </>
  ),
  leaf: () => (
    <>
      <path d="M4.5 19.5C3.5 12 9 4.8 19.5 4c1 10.2-6 15.9-13.5 15.9" />
      <path d="M5 19.5c3.8-4.6 7.8-7.4 11.5-8.6" />
    </>
  ),
  pin: () => (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  copy: () => (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2.2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  camera: () => (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.2 7l1.3-2a1 1 0 0 1 .8-.5h3.4a1 1 0 0 1 .8.5L15.8 7" />
      <circle cx="12" cy="13.5" r="3.2" />
    </>
  ),
  download: () => (
    <>
      <path d="M12 3.5v10.5" />
      <path d="M8 10.5l4 4 4-4" />
      <path d="M5 20h14" />
    </>
  ),
  upload: () => (
    <>
      <path d="M12 20V9.5" />
      <path d="M8 13.5l4-4 4 4" />
      <path d="M5 4h14" />
    </>
  ),
  image: () => (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17.5l4.5-5 3 3.2L16 13l3 4" />
    </>
  ),
  flag: (filled) => (
    <>
      <path d="M6 21V4" />
      <path
        d="M6 5h10.5l-2.2 3 2.2 3H6"
        fill={filled ? 'currentColor' : 'none'}
      />
    </>
  ),
}

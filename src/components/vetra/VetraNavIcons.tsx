interface VetraNavIconProps {
  name: 'companies' | 'outreach' | 'templates'
}

export function VetraNavIcon({ name }: VetraNavIconProps) {
  return (
    <svg
      className="vetra-side-navbar__icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      {name === 'companies' && (
        <>
          <path
            d="M4 20V8l8-4 8 4v12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 20v-6h6v6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M8 10h.01M12 8h.01M16 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {name === 'outreach' && (
        <>
          <path
            d="M3 11l18-8-8 18-2-7-7-2z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 6l5 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'templates' && (
        <>
          <path
            d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M16 4v4h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

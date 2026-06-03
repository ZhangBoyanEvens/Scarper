interface HomepageStartButtonProps {
  onClick: () => void
}

export function HomepageStartButton({ onClick }: HomepageStartButtonProps) {
  return (
    <button
      type="button"
      className="homepage-start-btn"
      onClick={onClick}
    >
      Start
    </button>
  )
}

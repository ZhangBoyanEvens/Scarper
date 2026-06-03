interface HomepageTutorialButtonProps {
  onClick: () => void
}

export function HomepageTutorialButton({ onClick }: HomepageTutorialButtonProps) {
  return (
    <button
      type="button"
      className="homepage-tutorial-btn"
      onClick={onClick}
    >
      /Tutorial
    </button>
  )
}

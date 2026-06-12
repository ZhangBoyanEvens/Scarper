import { useI18n } from '../../contexts/I18nContext'

interface HomepageTutorialButtonProps {
  onClick: () => void
}

export function HomepageTutorialButton({ onClick }: HomepageTutorialButtonProps) {
  const { t } = useI18n()
  return (
    <button type="button" className="homepage-tutorial-btn" onClick={onClick}>
      {t('homepage.tutorial')}
    </button>
  )
}

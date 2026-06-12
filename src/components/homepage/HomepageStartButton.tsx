import { useI18n } from '../../contexts/I18nContext'

interface HomepageStartButtonProps {
  onClick: () => void
}

export function HomepageStartButton({ onClick }: HomepageStartButtonProps) {
  const { t } = useI18n()
  return (
    <button type="button" className="homepage-start-btn" onClick={onClick}>
      {t('homepage.start')}
    </button>
  )
}

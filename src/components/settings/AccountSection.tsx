import { UserButton, useUser } from '@clerk/clerk-react'
import {
  formatExtractQuota,
  useUserProfileOptional,
} from '../../contexts/UserProfileContext'
import { useI18n } from '../../contexts/I18nContext'

export function AccountSection() {
  const { t } = useI18n()
  const { user, isLoaded } = useUser()
  const profile = useUserProfileOptional()?.profile ?? null

  if (!isLoaded || !user) {
    return <p className="settings-muted">{t('settings.account.loading')}</p>
  }

  return (
    <div className="settings-account-layout">
      <div className="settings-profile">
        <UserButton
          appearance={{
            elements: { avatarBox: 'settings-profile__avatar' },
          }}
        />
        <div className="settings-profile__meta">
          <span className="settings-profile__name">
            {profile?.name ?? user.fullName ?? user.username ?? t('common.user')}
          </span>
          <span className="settings-profile__email">
            {profile?.email ??
              user.primaryEmailAddress?.emailAddress ??
              '—'}
          </span>
        </div>
      </div>
      <div className="settings-metrics">
        <div className="settings-metric">
          <span className="settings-metric__label">
            {t('settings.account.todayScrapes')}
          </span>
          <span className="settings-metric__value settings-metric__value--accent">
            {formatExtractQuota(profile, t('common.unlimited'))}
          </span>
        </div>
        <div className="settings-metric">
          <span className="settings-metric__label">
            {t('settings.account.plan')}
          </span>
          <span className="settings-metric__value">
            {profile?.plan ?? 'free'}
          </span>
        </div>
        <div className="settings-metric">
          <span className="settings-metric__label">
            {t('settings.account.userId')}
          </span>
          <span
            className="settings-metric__value settings-metric__value--mono"
            title={profile?.user_id ?? user.id}
          >
            {profile?.user_id ?? user.id}
          </span>
        </div>
      </div>
    </div>
  )
}
import { UserButton, useUser } from '@clerk/clerk-react'
import {
  formatExtractQuota,
  useUserProfileOptional,
} from '../../contexts/UserProfileContext'

export function AccountSection() {
  const { user, isLoaded } = useUser()
  const profile = useUserProfileOptional()?.profile ?? null

  if (!isLoaded || !user) {
    return <p className="settings-muted">加载账号信息…</p>
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
            {profile?.name ?? user.fullName ?? user.username ?? '用户'}
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
          <span className="settings-metric__label">今日抓取</span>
          <span className="settings-metric__value settings-metric__value--accent">
            {formatExtractQuota(profile)}
          </span>
        </div>
        <div className="settings-metric">
          <span className="settings-metric__label">计划</span>
          <span className="settings-metric__value">
            {profile?.plan ?? 'free'}
          </span>
        </div>
        <div className="settings-metric">
          <span className="settings-metric__label">用户 ID</span>
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

import { useAppSettings } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'
import {
  getLocalizedOutputDetailLabel,
  getLocalizedOutputDetailOptions,
  getLocalizedOutputLanguageLabel,
  getLocalizedOutputLanguageOptions,
} from '../../i18n/outputOptions'
import { SegmentedControl } from './SegmentedControl'
import './LanguagePresetSection.css'

export function LanguagePresetSection() {
  const { t } = useI18n()
  const {
    settings: { outputLanguage, outputDetail },
    setOutputLanguage,
    setOutputDetail,
  } = useAppSettings()

  return (
    <section className="settings-panel language-preset">
      <div className="language-preset__summary" role="status">
        <p className="language-preset__summary-label">
          {t('settings.languagePreset.current')}
        </p>
        <p className="language-preset__summary-value">
          {getLocalizedOutputLanguageLabel(t, outputLanguage)}
          <span className="language-preset__summary-sep">·</span>
          {getLocalizedOutputDetailLabel(t, outputDetail)}
        </p>
        <p className="language-preset__summary-hint">
          {t('settings.languagePreset.syncHint')}
        </p>
      </div>

      <div className="settings-list">
        <div className="settings-list__row settings-list__row--stack">
          <div className="settings-list__text">
            <span className="settings-list__label">
              {t('settings.languagePreset.outputLanguage')}
            </span>
            <span className="settings-list__hint">
              {t('settings.languagePreset.outputLanguageHint')}
            </span>
          </div>
          <SegmentedControl
            ariaLabel={t('settings.languagePreset.outputLanguage')}
            value={outputLanguage}
            options={getLocalizedOutputLanguageOptions(t).map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onChange={setOutputLanguage}
          />
          <ul className="language-preset__option-descs">
            {getLocalizedOutputLanguageOptions(t).map((o) => (
              <li
                key={o.value}
                className={
                  o.value === outputLanguage
                    ? 'language-preset__option-desc is-active'
                    : 'language-preset__option-desc'
                }
              >
                <strong>{o.label}</strong> — {o.description}
              </li>
            ))}
          </ul>
        </div>

        <div className="settings-list__row settings-list__row--stack">
          <div className="settings-list__text">
            <span className="settings-list__label">
              {t('settings.languagePreset.detail')}
            </span>
            <span className="settings-list__hint">
              {t('settings.languagePreset.detailHint')}
            </span>
          </div>
          <SegmentedControl
            ariaLabel={t('settings.languagePreset.detail')}
            value={outputDetail}
            options={getLocalizedOutputDetailOptions(t).map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onChange={setOutputDetail}
          />
          <ul className="language-preset__option-descs">
            {getLocalizedOutputDetailOptions(t).map((o) => (
              <li
                key={o.value}
                className={
                  o.value === outputDetail
                    ? 'language-preset__option-desc is-active'
                    : 'language-preset__option-desc'
                }
              >
                <strong>{o.label}</strong> — {o.description}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="settings-callout settings-callout--info language-preset__scope">
        <p className="settings-callout__title">
          {t('settings.languagePreset.scopeTitle')}
        </p>
        <ul className="settings-data-list">
          <li>
            <strong>Scrape</strong> — {t('settings.languagePreset.scopeScrape')}
          </li>
          <li>
            <strong>FinDoc</strong> — {t('settings.languagePreset.scopeFindoc')}
          </li>
          <li>
            <strong>Project</strong> —{' '}
            {t('settings.languagePreset.scopeUpload')}
          </li>
        </ul>
      </div>
    </section>
  )
}
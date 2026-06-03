import { useAppSettings } from '../../contexts/AppSettingsContext'
import {
  getOutputDetailLabel,
  OUTPUT_DETAIL_OPTIONS,
} from '../../types/outputDetail'
import {
  getOutputLanguageLabel,
  OUTPUT_LANGUAGE_OPTIONS,
} from '../../types/outputLanguage'
import { SegmentedControl } from './SegmentedControl'
import './LanguagePresetSection.css'

export function LanguagePresetSection() {
  const {
    settings: { outputLanguage, outputDetail },
    setOutputLanguage,
    setOutputDetail,
  } = useAppSettings()

  return (
    <section className="settings-panel language-preset">
      <div className="language-preset__summary" role="status">
        <p className="language-preset__summary-label">当前全局预设</p>
        <p className="language-preset__summary-value">
          {getOutputLanguageLabel(outputLanguage)}
          <span className="language-preset__summary-sep">·</span>
          {getOutputDetailLabel(outputDetail)}
        </p>
        <p className="language-preset__summary-hint">
          保存后立即生效，Scrape 页工具栏会与此同步
        </p>
      </div>

      <div className="settings-list">
        <div className="settings-list__row settings-list__row--stack">
          <div className="settings-list__text">
            <span className="settings-list__label">输出语言</span>
            <span className="settings-list__hint">
              抓取摘要、AI 整合与 FinDoc 改写的默认语言
            </span>
          </div>
          <SegmentedControl
            ariaLabel="全局输出语言"
            value={outputLanguage}
            options={OUTPUT_LANGUAGE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onChange={setOutputLanguage}
          />
          <ul className="language-preset__option-descs">
            {OUTPUT_LANGUAGE_OPTIONS.map((o) => (
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
            <span className="settings-list__label">详细程度</span>
            <span className="settings-list__hint">
              控制 AI 摘要长度与要点数量
            </span>
          </div>
          <SegmentedControl
            ariaLabel="全局详细程度"
            value={outputDetail}
            options={OUTPUT_DETAIL_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onChange={setOutputDetail}
          />
          <ul className="language-preset__option-descs">
            {OUTPUT_DETAIL_OPTIONS.map((o) => (
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
        <p className="settings-callout__title">预设生效范围</p>
        <ul className="settings-data-list">
          <li>
            <strong>Scrape</strong> — 单链抓取与多 URL AI 整合
          </li>
          <li>
            <strong>FinDoc</strong> — Proceed 模板改写输出
          </li>
          <li>
            <strong>Project 上传</strong> — 抓取结果入库时的摘要语言
          </li>
        </ul>
      </div>
    </section>
  )
}

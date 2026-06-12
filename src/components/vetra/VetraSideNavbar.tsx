import { useI18n } from '../../contexts/I18nContext'
import '../../styles/panel.css'
import { VETRA_NAV_ITEMS, type VetraNavId } from './vetraNav'
import { VetraNavIcon } from './VetraNavIcons'
import './VetraSideNavbar.css'

interface VetraSideNavbarProps {
  activeId: VetraNavId
  onNavigate: (id: VetraNavId) => void
}

export function VetraSideNavbar({ activeId, onNavigate }: VetraSideNavbarProps) {
  const { t } = useI18n()
  return (
    <aside className="vetra-side-navbar" aria-label="Vetra navigation">
      <div className="vetra-side-navbar__hover-area">
        <div className="vetra-side-navbar__edge" aria-hidden />
        <div className="vetra-side-navbar__panel">
          <div className="panel-shell vetra-side-navbar__shell">
            <div className="panel-inner vetra-side-navbar__inner">
              <header className="vetra-side-navbar__head">
                <h2 className="vetra-side-navbar__title">{t('vetra.title')}</h2>
              </header>
              <nav className="vetra-side-navbar__nav" aria-label="Vetra sections">
                {VETRA_NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`vetra-side-navbar__link${
                      activeId === item.id ? ' vetra-side-navbar__link--active' : ''
                    }`}
                    aria-current={activeId === item.id ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                  >
                    <VetraNavIcon name={item.id} />
                    <span className="vetra-side-navbar__label">{t(item.labelKey)}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

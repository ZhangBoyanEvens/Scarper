import './SettingsToggle.css'

interface SettingsToggleProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function SettingsToggle({
  id,
  checked,
  onChange,
  label,
  description,
  disabled,
}: SettingsToggleProps) {
  return (
    <div className="settings-toggle">
      <div className="settings-toggle__text">
        <label htmlFor={id} className="settings-toggle__label">
          {label}
        </label>
        {description && (
          <p className="settings-toggle__desc">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`settings-switch${checked ? ' settings-switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-switch__thumb" />
      </button>
    </div>
  )
}

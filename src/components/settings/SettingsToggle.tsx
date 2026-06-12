import { Switch } from 'antd'

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
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 0',
        borderBottom: '1px solid rgba(5, 5, 5, 0.06)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <label htmlFor={id} style={{ fontWeight: 500, color: 'rgba(0,0,0,0.88)' }}>
          {label}
        </label>
        {description ? (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  )
}

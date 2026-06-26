import './ToggleSwitch.css'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id: string
}

export function ToggleSwitch({ checked, onChange, label, id }: ToggleSwitchProps) {
  const labelId = `${id}-label`

  return (
    <div className="toggle-switch">
      <span id={labelId} className="toggle-switch-label">
        {label}
      </span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className="toggle-track"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  )
}

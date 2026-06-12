import './DeleteButton.css'

interface DeleteButtonProps {
  onClick: () => void
  label?: string
}

export function DeleteButton({ onClick, label = 'Delete item' }: DeleteButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="delete-button"
    >
      <svg
        className="trash-svg"
        viewBox="0 -10 64 74"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g id="trash-can">
          <rect x="16" y="24" width="32" height="30" rx="3" ry="3" fill="#e74c3c" />
          <g style={{ transformOrigin: '12px 18px' }} id="lid-group">
            <rect x="12" y="12" width="40" height="6" rx="2" ry="2" fill="#c0392b" />
            <rect x="26" y="8" width="12" height="4" rx="2" ry="2" fill="#c0392b" />
          </g>
        </g>
      </svg>
    </button>
  )
}

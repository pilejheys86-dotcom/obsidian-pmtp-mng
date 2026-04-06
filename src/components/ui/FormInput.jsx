const FormInput = ({
  id,
  name,
  type = 'text',
  label,
  placeholder,
  icon,
  required = false,
  autoComplete,
  hint,
  rightElement,
  value,
  onChange,
}) => {
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="form-label">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="form-input-icon">
            <span className="material-symbols-outlined">{icon}</span>
          </div>
        )}
        <input
          id={id}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          className={`form-input ${!icon ? 'pl-3' : ''}`}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-muted mt-1 pl-1">{hint}</p>}
    </div>
  )
}

export default FormInput

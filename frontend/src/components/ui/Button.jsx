import React from 'react'

const Button = ({ 
  children, 
  onClick, 
  type = 'button', 
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  ...props 
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`auth-button auth-button--${variant} ${className} ${loading ? 'loading' : ''}`}
      {...props}
    >
      {loading ? (
        <span className="loading-spinner">⟳</span>
      ) : (
        children
      )}
    </button>
  )
}

export default Button

import React from 'react'
import '../../styles/auth.css'

const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">CodeLab IDE</h1>
          <h2 className="auth-subtitle">{title}</h2>
          {subtitle && <p className="auth-description">{subtitle}</p>}
        </div>
        <div className="auth-form-container">
          {children}
        </div>
      </div>
    </div>
  )
}

export default AuthLayout

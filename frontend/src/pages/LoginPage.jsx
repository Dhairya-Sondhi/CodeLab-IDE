import React from 'react'
import AuthLayout from '../components/auth/AuthLayout'
import LoginForm from '../components/auth/LoginForm'

const LoginPage = () => {
  return (
    <AuthLayout 
      title="Welcome Back" 
      subtitle="Sign in to your CodeLab account"
    >
      <LoginForm />
    </AuthLayout>
  )
}

export default LoginPage

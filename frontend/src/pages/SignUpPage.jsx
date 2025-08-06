import React from 'react'
import AuthLayout from '../components/auth/AuthLayout'
import SignUpForm from '../components/auth/SignUpForm'

const SignUpPage = () => {
  return (
    <AuthLayout 
      title="Create Account" 
      subtitle="Join CodeLab and start coding together"
    >
      <SignUpForm />
    </AuthLayout>
  )
}

export default SignUpPage

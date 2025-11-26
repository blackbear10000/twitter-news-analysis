import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'

import { login } from '../lib/api'
import { useAuthStore } from '../store/useAuthStore'

export const LoginForm = () => {
  const setToken = useAuthStore((state) => state.setToken)
  const logout = useAuthStore((state) => state.logout)
  const [formState, setFormState] = useState({ username: '', password: '' })

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setToken(data.access_token)
    },
    onError: () => {
      logout()
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate(formState)
  }

  return (
    <form onSubmit={handleSubmit} className="login-card">
      <h1 className="title">Admin Login</h1>
      <input
        className="input"
        placeholder="Username"
        value={formState.username}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, username: event.target.value }))
        }
      />
      <input
        className="input"
        placeholder="Password"
        type="password"
        value={formState.password}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, password: event.target.value }))
        }
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="primary-button"
      >
        {mutation.isPending ? 'Signing in...' : 'Login'}
      </button>
      {mutation.isError && (
        <p className="error-text">Login failed. Double-check your credentials.</p>
      )}
    </form>
  )
}


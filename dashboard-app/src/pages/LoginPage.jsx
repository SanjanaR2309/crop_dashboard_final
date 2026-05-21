import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../utils/auth'

const Logo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
    <path d="M13.8261 17.4264C16.7203 18.1174 20.2244 18.5217 24 18.5217C27.7756 18.5217 31.2797 18.1174 34.1739 17.4264C36.9144 16.7722 39.9967 15.2331 41.3563 14.1648L24.8486 40.6391C24.4571 41.267 23.5429 41.267 23.1514 40.6391L6.64374 14.1648C8.00331 15.2331 11.0856 16.7722 13.8261 17.4264Z" fill="currentColor"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M39.998 12.236C39.9857 12.1489 39.9006 11.8501 39.3151 11.3686C38.6545 10.8254 37.5778 10.2469 36.0709 9.72276C33.0758 8.68098 28.8081 8 24 8C19.1919 8 14.9242 8.68098 11.9291 9.72276C10.4222 10.2469 9.34546 10.8254 8.68485 11.3686C8.0104 11.9233 8.00004 12.2359 8.00004 12.2612C8.00039 12.2667 8.00356 12.3152 8.15052 12.7408C9.44505 13.6897 12.0012 14.9346 14.2905 15.4811C17.0125 16.131 20.3587 16.5217 24 16.5217C27.6413 16.5217 30.9875 16.131 33.7095 15.4811C35.9788 14.9393 38.5103 13.7113 39.8346 12.7175C39.9748 12.3294 39.9944 12.2537 39.998 12.236Z" fill="currentColor"/>
  </svg>
)

export default function LoginPage() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (login(key)) {
      navigate('/dashboard')
    } else {
      setError('Invalid admin key. Please try again.')
      setShaking(true)
      setTimeout(() => setShaking(false), 400)
    }
  }

  return (
    <div className="login-page">
      <div className={`login-card ${shaking ? 'shake' : ''}`}>
        <div className="login-logo">
          <Logo />
          <h1>Silo</h1>
        </div>
        <p className="login-subtitle">Enter your admin key to access the dashboard.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="admin-key">Admin Key</label>
            <input
              id="admin-key"
              type="password"
              className={`form-input ${error ? 'error' : ''}`}
              value={key}
              onChange={e => { setKey(e.target.value); setError('') }}
              placeholder="Enter admin key"
              autoComplete="current-password"
              autoFocus
            />
            {error && <p className="form-error">{error}</p>}
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            Sign In
          </button>
        </form>
        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Access is restricted to authorized administrators only.
        </p>
      </div>
    </div>
  )
}

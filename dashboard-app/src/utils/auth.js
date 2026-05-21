// Auth helpers — key stored in sessionStorage, value from .env
export const isAuthenticated = () =>
  sessionStorage.getItem('adminAuthenticated') === 'true'

export const login = (key) => {
  if (key === import.meta.env.VITE_ADMIN_KEY) {
    sessionStorage.setItem('adminAuthenticated', 'true')
    return true
  }
  return false
}

export const logout = () => {
  sessionStorage.removeItem('adminAuthenticated')
}

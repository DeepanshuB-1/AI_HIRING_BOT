import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('hr_token'))
  const [ready, setReady] = useState(false)

  // Set axios default header whenever token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      // Verify token is still valid
      axios.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => logout())
        .finally(() => setReady(true))
    } else {
      delete axios.defaults.headers.common['Authorization']
      setUser(null)
      setReady(true)
    }
  }, [token])

  const login = (tokenStr, userData) => {
    localStorage.setItem('hr_token', tokenStr)
    axios.defaults.headers.common['Authorization'] = `Bearer ${tokenStr}`
    setToken(tokenStr)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('hr_token')
    delete axios.defaults.headers.common['Authorization']
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const CandidateAuthContext = createContext(null)

export function CandidateAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('candidate_token'))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (token) {
      axios.get('/api/portal/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setUser(r.data))
        .catch(() => { localStorage.removeItem('candidate_token'); setToken(null) })
        .finally(() => setReady(true))
    } else {
      setReady(true)
    }
  }, [token])

  const login = (tokenStr, userData) => {
    localStorage.setItem('candidate_token', tokenStr)
    setToken(tokenStr)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('candidate_token')
    setToken(null)
    setUser(null)
  }

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {}

  return (
    <CandidateAuthContext.Provider value={{ user, token, login, logout, ready, authHeader }}>
      {children}
    </CandidateAuthContext.Provider>
  )
}

export const useCandidateAuth = () => useContext(CandidateAuthContext)

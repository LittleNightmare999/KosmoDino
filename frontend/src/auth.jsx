import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, getToken, setToken } from './api.js'

const AuthContext = createContext(null)

export const ROLE_LABELS = { reader: 'Читатель', editor: 'Редактор', admin: 'Администратор' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      setReady(true)
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true))
  }, [])

  const accept = useCallback((res) => {
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      ready,
      login: (u, p) => api.login(u, p).then(accept),
      register: (data) => api.register(data).then(accept),
      logout: () => {
        setToken(null)
        setUser(null)
      },
      refresh: () => api.me().then(setUser),
      can: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, ready, accept],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

// Маршрут, доступный только перечисленным ролям
export function RequireRole({ roles, children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <p className="state">Проверяем доступ…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) {
    return (
      <section className="page narrow">
        <h1>Нет доступа</h1>
        <p>Этот раздел доступен ролям: {roles.map((r) => ROLE_LABELS[r]).join(', ')}.</p>
      </section>
    )
  }
  return children
}

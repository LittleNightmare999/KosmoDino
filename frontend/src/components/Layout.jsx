import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ROLE_LABELS, useAuth } from '../auth.jsx'

export function Mark({ size = 28 }) {
  // Знак продукта: планета (пастельно-зелёный круг) и пластины стегозавра (бежевые треугольники)
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" fill="#1b241e" />
      <circle cx="12" cy="12" r="6.5" fill="#cfe3c8" />
      <path d="M14 27 L18 19 L22 27 Z M20 27 L24.5 17 L29 27 Z" fill="#efe6d4" />
    </svg>
  )
}

const NAV = [
  ['/encyclopedia', 'Энциклопедия'],
  ['/timeline/dinosaurs', 'Хронология'],
  ['/graph', 'Граф связей'],
  ['/quiz/space', 'Викторина'],
]

export function TopBar() {
  const { user, logout, can } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="wordmark" aria-label="КосмоДино — на главную">
          <Mark />
          КосмоДино
        </Link>
        <nav className={`mainnav${open ? ' open' : ''}`} aria-label="Основная навигация" onClick={() => setOpen(false)}>
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={() => (pathname.startsWith(to.split('/').slice(0, 2).join('/')) ? 'active' : '')}
            >
              {label}
            </NavLink>
          ))}
          {can('editor', 'admin') && <NavLink to="/editor">Редакция</NavLink>}
          {can('admin') && <NavLink to="/admin">Администрирование</NavLink>}
        </nav>
        <div className="topbar-right">
          {user ? (
            <>
              <Link to="/me" title={ROLE_LABELS[user.role]}>
                {user.full_name || user.username}
              </Link>
              <button className="btn small quiet" onClick={logout}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Войти</Link>
              <Link to="/register" className="btn small">
                Регистрация
              </Link>
            </>
          )}
          <button
            className="btn small quiet menu-toggle"
            aria-expanded={open}
            aria-label="Меню"
            onClick={() => setOpen((v) => !v)}
          >
            Меню
          </button>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>КосмоДино — курсовой проект по дисциплине «Программная инженерия»</span>
        <span>Гуляева Анастасия Павловна, группа 25-КБ-ПИ1, 2026</span>
      </div>
    </footer>
  )
}

export default function Layout() {
  return (
    <>
      <TopBar />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </>
  )
}

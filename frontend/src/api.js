// Тонкий клиент REST API. Токен хранится в localStorage и добавляется в заголовок Authorization.
const TOKEN_KEY = 'cosmodino.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* хранилище недоступно — сессия живёт до перезагрузки */
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function describe(detail) {
  if (!detail) return 'Ошибка запроса'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
  return 'Ошибка запроса'
}

export async function request(path, { method = 'GET', body, query } = {}) {
  let url = `/api${path}`
  if (query) {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v)
    })
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  const headers = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, describe(data?.detail))
  return data
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  me: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', { method: 'PATCH', body: data }),
  changePassword: (data) => request('/auth/me/password', { method: 'POST', body: data }),

  topics: () => request('/topics'),
  tags: (topic) => request('/tags', { query: { topic } }),
  articles: (query) => request('/articles', { query }),
  article: (slug) => request(`/articles/${slug}`),
  timeline: (topic) => request(`/timeline/${topic}`),
  graph: (topic) => request('/graph', { query: { topic } }),

  comments: (slug) => request(`/articles/${slug}/comments`),
  addComment: (slug, body) => request(`/articles/${slug}/comments`, { method: 'POST', body: { body } }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
  bookmarks: () => request('/me/bookmarks'),
  bookmark: (slug, on) => request(`/me/bookmarks/${slug}`, { method: on ? 'PUT' : 'DELETE' }),
  myStats: () => request('/me/stats'),
  quiz: (topic, count = 8) => request(`/quiz/${topic}`, { query: { count } }),
  submitQuiz: (topic_slug, answers) => request('/quiz/submit', { method: 'POST', body: { topic_slug, answers } }),
  attempts: () => request('/me/quiz-attempts'),

  myArticles: () => request('/editor/articles'),
  createArticle: (data) => request('/editor/articles', { method: 'POST', body: data }),
  updateArticle: (slug, data) => request(`/editor/articles/${slug}`, { method: 'PUT', body: data }),
  submitArticle: (slug) => request(`/editor/articles/${slug}/submit`, { method: 'POST' }),
  revisions: (slug) => request(`/editor/articles/${slug}/revisions`),
  addLink: (slug, data) => request(`/editor/articles/${slug}/links`, { method: 'POST', body: data }),
  removeLink: (slug, target) => request(`/editor/articles/${slug}/links/${target}`, { method: 'DELETE' }),
  questions: (slug) => request(`/editor/articles/${slug}/quiz`),
  addQuestion: (slug, data) => request(`/editor/articles/${slug}/quiz`, { method: 'POST', body: data }),
  deleteQuestion: (id) => request(`/editor/quiz/${id}`, { method: 'DELETE' }),

  adminStats: () => request('/admin/stats'),
  adminArticles: (query) => request('/admin/articles', { query }),
  review: (slug, approve, note) => request(`/admin/articles/${slug}/review`, { method: 'POST', body: { approve, note } }),
  archive: (slug) => request(`/admin/articles/${slug}/archive`, { method: 'POST' }),
  restore: (slug) => request(`/admin/articles/${slug}/restore`, { method: 'POST' }),
  deleteArticle: (slug) => request(`/admin/articles/${slug}`, { method: 'DELETE' }),
  adminUsers: (query) => request('/admin/users', { query }),
  updateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PATCH', body: data }),
  adminComments: (status) => request('/admin/comments', { query: { status } }),
  moderateComment: (id, status) => request(`/admin/comments/${id}`, { method: 'PATCH', body: { status } }),
  createCategory: (data) => request('/admin/categories', { method: 'POST', body: data }),
  deleteCategory: (id) => request(`/admin/categories/${id}`, { method: 'DELETE' }),
  audit: (limit = 150) => request('/admin/audit', { query: { limit } }),
}

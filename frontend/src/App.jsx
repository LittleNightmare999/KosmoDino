import { Link, Route, Routes } from 'react-router-dom'
import { RequireRole } from './auth.jsx'
import Layout from './components/Layout.jsx'
import { Admin } from './pages/admin/index.js'
import Article from './pages/Article.jsx'
import { Login, Register } from './pages/Auth.jsx'
import Catalog from './pages/Catalog.jsx'
import ArticleEditor from './pages/editor/ArticleEditor.jsx'
import EditorHome from './pages/editor/EditorHome.jsx'
import Graph from './pages/Graph.jsx'
import Landing from './pages/Landing.jsx'
import Profile from './pages/Profile.jsx'
import Quiz from './pages/Quiz.jsx'
import Timeline from './pages/Timeline.jsx'

function NotFound() {
  return (
    <section className="page narrow">
      <h1>Страница не найдена</h1>
      <p style={{ margin: '12px 0 24px' }}>Возможно, статья перенесена в архив или адрес набран с ошибкой.</p>
      <Link className="btn" to="/encyclopedia">
        К энциклопедии
      </Link>
    </section>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Layout />}>
        <Route path="/encyclopedia" element={<Catalog />} />
        <Route path="/topic/:slug" element={<Catalog />} />
        <Route path="/article/:slug" element={<Article />} />
        <Route path="/timeline/:topic" element={<Timeline />} />
        <Route path="/graph" element={<Graph />} />
        <Route path="/quiz/:topic" element={<Quiz />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/me" element={<RequireRole><Profile /></RequireRole>} />
        <Route path="/editor" element={<RequireRole roles={['editor', 'admin']}><EditorHome /></RequireRole>} />
        <Route path="/editor/new" element={<RequireRole roles={['editor', 'admin']}><ArticleEditor /></RequireRole>} />
        <Route path="/editor/:slug" element={<RequireRole roles={['editor', 'admin']}><ArticleEditor /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><Admin.Layout /></RequireRole>}>
          <Route index element={<Admin.Overview />} />
          <Route path="moderation" element={<Admin.Moderation />} />
          <Route path="articles" element={<Admin.Articles />} />
          <Route path="users" element={<Admin.Users />} />
          <Route path="comments" element={<Admin.Comments />} />
          <Route path="categories" element={<Admin.Categories />} />
          <Route path="audit" element={<Admin.Audit />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

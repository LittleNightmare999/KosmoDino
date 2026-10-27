import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Loader, StatusPill, formatDate, useAsync, useDocumentTitle } from '../../components/common.jsx'

export default function EditorHome() {
  useDocumentTitle('Редакция')
  const state = useAsync(() => api.myArticles(), [])
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Мои статьи</h1>
          <p>
            Черновик → на рецензии → опубликована. Отклонённую статью можно исправить и отправить снова; правка
            опубликованной статьи возвращает её на рецензию.
          </p>
        </div>
        <Link className="btn primary" to="/editor/new">
          Новая статья
        </Link>
      </div>
      <Loader state={state}>
        {(items) =>
          items.length === 0 ? (
            <p className="state">У вас пока нет статей. Начните с кнопки «Новая статья».</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Статья</th>
                    <th>Категория</th>
                    <th>Состояние</th>
                    <th>Изменена</th>
                    <th className="num">Просмотры</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/editor/${a.slug}`}>{a.title}</Link>
                      </td>
                      <td>{a.category_name}</td>
                      <td>
                        <StatusPill status={a.status} />
                      </td>
                      <td>{formatDate(a.updated_at)}</td>
                      <td className="num">{a.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>
    </div>
  )
}

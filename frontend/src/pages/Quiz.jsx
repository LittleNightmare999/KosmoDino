import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Loader, plural, useAsync, useDocumentTitle } from '../components/common.jsx'

const KEYS = ['А', 'Б', 'В', 'Г', 'Д', 'Е']

export default function Quiz() {
  const { topic } = useParams()
  const { user } = useAuth()
  const [round, setRound] = useState(0)
  const state = useAsync(() => api.quiz(topic, 8), [topic, round])
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const name = topic === 'space' ? 'Космос' : 'Динозавры'
  useDocumentTitle(`Викторина: ${name}`)

  const restart = () => {
    setAnswers({})
    setResult(null)
    setRound((r) => r + 1)
  }

  const submit = async (questions) => {
    setError(null)
    try {
      const res = await api.submitQuiz(
        topic,
        questions.map((q) => ({ question_id: q.id, selected_index: answers[q.id] })),
      )
      setResult(res)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div data-topic={topic}>
      <section className="topic-band">
        <div className="topic-band-inner">
          <div>
            <h1>Викторина: {name}</h1>
            <p>Восемь случайных вопросов по статьям раздела. Результаты сохраняются в личном кабинете.</p>
          </div>
          <nav className="topic-switch" aria-label="Раздел">
            <Link to="/quiz/space" className={topic === 'space' ? 'active' : ''} onClick={restart}>
              Космос
            </Link>
            <Link to="/quiz/dinosaurs" className={topic === 'dinosaurs' ? 'active' : ''} onClick={restart}>
              Динозавры
            </Link>
          </nav>
        </div>
      </section>
      <div className="page narrow">
        <Loader state={state}>
          {(questions) => {
            const byId = new Map(result?.items.map((i) => [i.question_id, i]))
            const done = questions.every((q) => answers[q.id] !== undefined)
            return (
              <>
                {result && (
                  <div className="score" role="status">
                    <strong>
                      {result.score} из {result.total}
                    </strong>
                    <span>
                      {result.score === result.total
                        ? 'Все ответы верные.'
                        : `${result.total - result.score} ${plural(result.total - result.score, 'ошибка', 'ошибки', 'ошибок')} — правильные ответы отмечены ниже.`}
                    </span>
                  </div>
                )}
                {questions.map((q, n) => {
                  const r = byId.get(q.id)
                  return (
                    <div className="quiz-q" key={q.id}>
                      <p className="from">
                        Вопрос {n + 1} из {questions.length} · по статье{' '}
                        <Link to={`/article/${q.article_slug}`}>{q.article_title}</Link>
                      </p>
                      <h2>{q.question}</h2>
                      <div className="options" role="radiogroup" aria-label={q.question}>
                        {q.options.map((opt, i) => {
                          let cls = 'option'
                          if (r) {
                            if (i === r.correct_index) cls += ' correct'
                            else if (answers[q.id] === i) cls += ' wrong'
                          } else if (answers[q.id] === i) cls += ' selected'
                          return (
                            <button
                              key={i}
                              className={cls}
                              role="radio"
                              aria-checked={answers[q.id] === i}
                              disabled={!!result}
                              onClick={() => setAnswers({ ...answers, [q.id]: i })}
                            >
                              <span className="key">{KEYS[i]}</span>
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                      {r?.explanation && <p className="small muted" style={{ marginTop: 10 }}>{r.explanation}</p>}
                    </div>
                  )
                })}
                {error && <p className="alert">{error}</p>}
                <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
                  {result ? (
                    <button className="btn primary" onClick={restart}>
                      Новый набор вопросов
                    </button>
                  ) : user ? (
                    <button className="btn primary" disabled={!done} onClick={() => submit(questions)}>
                      Проверить ответы
                    </button>
                  ) : (
                    <Link className="btn primary" to="/login" state={{ from: `/quiz/${topic}` }}>
                      Войти, чтобы проверить ответы
                    </Link>
                  )}
                  {!result && (
                    <span className="small muted">
                      Отвечено {Object.keys(answers).length} из {questions.length}
                    </span>
                  )}
                </div>
              </>
            )
          }}
        </Loader>
      </div>
    </div>
  )
}

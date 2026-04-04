import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getQuestion } from "../api";

export default function QuestionPage({ engine }) {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;

    async function fetchQuestion() {
      setLoading(true);
      setError("");

      try {
        const response = await getQuestion(id, engine);
        if (active) {
          setPayload(response);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchQuestion();

    return () => {
      active = false;
    };
  }, [id, engine]);

  if (loading) {
    return <p className="status loading">Loading question...</p>;
  }

  if (error) {
    return <p className="status error">{error}</p>;
  }

  const question = payload?.data;

  if (!question) {
    return <p className="status error">Question data unavailable.</p>;
  }

  return (
    <section className="detail-wrap">
      <article className="detail-card">
        <h2>{question.title}</h2>
        <p>{question.body}</p>
        <div className="chip-row">
          {question.tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
        <p className="meta-row">
          Score {question.score} | {question.answers.length} answers | Query {payload.meta.timingMs} ms ({payload.meta.engine})
        </p>
      </article>

      <section className="answer-list">
        <h3>Answers</h3>
        {question.answers.map((answer) => (
          <article key={answer.id} className="answer-card">
            <p>{answer.body}</p>
            <p className="answer-meta">
              by {answer.author} | score {answer.score}
            </p>
          </article>
        ))}
      </section>

      <section className="query-card">
        <h3>Query Inspector (placeholder)</h3>
        <pre>{payload.queryInspector.sql}</pre>
      </section>
    </section>
  );
}

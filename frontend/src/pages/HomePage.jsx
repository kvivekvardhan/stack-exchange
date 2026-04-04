import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchQuestions } from "../api";

export default function HomePage({ engine }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [tag, setTag] = useState(searchParams.get("tag") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);

  async function runSearch(nextQ, nextTag) {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (nextQ) {
      params.set("q", nextQ);
    }
    if (nextTag) {
      params.set("tag", nextTag);
    }
    setSearchParams(params, { replace: true });

    try {
      const response = await searchQuestions({ q: nextQ, tag: nextTag, engine });
      setResults(response.data);
      setMeta(response.meta);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    runSearch(q.trim(), tag.trim());
  }

  useEffect(() => {
    runSearch(q.trim(), tag.trim());
    // Re-run the same query whenever engine selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return (
    <section>
      <div className="hero-card">
        <h2>Search Questions</h2>
        <p>
          Find relevant developer questions by keyword and optional tag filter.
        </p>
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search title or body"
          />
          <input
            type="text"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="Filter by tag (optional)"
          />
          <button type="submit">Run Search</button>
        </form>
      </div>

      {loading && <p className="status loading">Loading results...</p>}
      {error && <p className="status error">{error}</p>}

      {meta && (
        <p className="meta-row">
          {meta.resultCount} results in {meta.timingMs} ms using {meta.engine}
        </p>
      )}

      <div className="result-list">
        {results.map((item) => (
          <article key={item.id} className="result-card">
            <h3>
              <Link to={`/question/${item.id}`}>{item.title}</Link>
            </h3>
            <div className="chip-row">
              {item.tags.map((itemTag) => (
                <span key={itemTag} className="chip">
                  {itemTag}
                </span>
              ))}
            </div>
            <p className="result-metrics">
              Score {item.score} | Answers {item.answerCount}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

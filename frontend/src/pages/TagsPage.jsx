import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTags } from "../api";
import QueryInspector from "../components/QueryInspector";

export default function TagsPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tags, setTags] = useState([]);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadTags() {
      setLoading(true);
      setError("");
      try {
        const response = await getTags({ q: query.trim() });
        if (active) {
          setTags(response.data);
          setMeta(response.meta || null);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
          setTags([]);
          setMeta(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTags();

    return () => {
      active = false;
    };
  }, [query]);

  function handleSubmit(event) {
    event.preventDefault();
    setQuery(search.trim());
  }

  return (
    <section className="tag-page">
      <header className="panel-header">
        <div>
          <h2>Browse Tags</h2>
          <p>Explore topics and jump straight into tagged questions.</p>
        </div>
      </header>

      <form className="so-search-form single" onSubmit={handleSubmit}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tags..."
          aria-label="Search tags"
        />
        <button type="submit">Search</button>
      </form>

      {loading && <p className="status loading">Loading tags...</p>}
      {error && <p className="status error">{error}</p>}

      {!loading && !error && tags.length === 0 && (
        <p className="status empty">No tags found.</p>
      )}

      <div className="tag-grid">
        {tags.map((tag) => (
          <article key={tag.id} className="tag-card">
            <div>
              <h3>
                <Link to={`/questions?tag=${encodeURIComponent(tag.name)}`}>{tag.name}</Link>
              </h3>
              <p className="tag-description">{tag.description}</p>
            </div>
            <p className="tag-count">{tag.questionCount} questions</p>
          </article>
        ))}
      </div>

      {meta?.inspector && meta.inspector.length > 0 && (
        <QueryInspector title="Tag Queries" inspector={meta.inspector} />
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTags } from "../api";

export default function TagsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tags, setTags] = useState([]);

  useEffect(() => {
    let active = true;

    async function fetchTags() {
      try {
        const response = await getTags();
        if (active) {
          setTags(response.data);
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

    fetchTags();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <p className="status loading">Loading tags...</p>;
  }

  if (error) {
    return <p className="status error">{error}</p>;
  }

  return (
    <section>
      <h2>Browse Tags</h2>
      <p className="page-lead">Use a tag to jump back to filtered question results.</p>
      <div className="tag-grid">
        {tags.map((tag) => (
          <article key={tag.name} className="tag-card">
            <h3>{tag.name}</h3>
            <p>{tag.description}</p>
            <p className="meta-row">{tag.questionCount} questions</p>
            <Link to={`/?tag=${encodeURIComponent(tag.name)}`} className="inline-link">
              Search this tag
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

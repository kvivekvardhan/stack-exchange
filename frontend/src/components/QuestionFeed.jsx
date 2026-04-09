import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchQuestions } from "../api";

const SORT_OPTIONS = [
  { value: "upvotes_desc", label: "Upvotes: High to Low" },
  { value: "upvotes_asc", label: "Upvotes: Low to High" },
  { value: "views_desc", label: "Views: High to Low" },
  { value: "views_asc", label: "Views: Low to High" },
  { value: "time_desc", label: "Timeline: Newest First" },
  { value: "time_asc", label: "Timeline: Oldest First" }
];

function isValidSort(value) {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function formatCreatedAt(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function sortQuestions(items, sortValue) {
  const sorted = [...items];

  sorted.sort((left, right) => {
    if (sortValue === "upvotes_asc") {
      return left.score - right.score;
    }
    if (sortValue === "upvotes_desc") {
      return right.score - left.score;
    }
    if (sortValue === "views_asc") {
      return (left.views || 0) - (right.views || 0);
    }
    if (sortValue === "views_desc") {
      return (right.views || 0) - (left.views || 0);
    }

    const leftTime = new Date(left.createdAt).getTime() || 0;
    const rightTime = new Date(right.createdAt).getTime() || 0;
    if (sortValue === "time_asc") {
      return leftTime - rightTime;
    }
    return rightTime - leftTime;
  });

  return sorted;
}

export default function QuestionFeed({
  title,
  subtitle,
  previewLimit,
  enableSorting = false,
  defaultSort = "upvotes_desc"
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get("q") || "";
  const urlTag = searchParams.get("tag") || "";
  const rawSort = searchParams.get("sort");
  const activeSort = isValidSort(rawSort) ? rawSort : defaultSort;
  const [searchInput, setSearchInput] = useState(urlQ);
  const [tagInput, setTagInput] = useState(urlTag);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    setSearchInput(urlQ);
  }, [urlQ]);

  useEffect(() => {
    setTagInput(urlTag);
  }, [urlTag]);

  useEffect(() => {
    let active = true;

    async function fetchResults() {
      setLoading(true);
      setError("");

      try {
        const response = await searchQuestions({ q: urlQ.trim(), tag: urlTag.trim() });
        if (active) {
          setResults(response.data);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
          setResults([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchResults();

    return () => {
      active = false;
    };
  }, [urlQ, urlTag]);

  function handleSubmit(event) {
    event.preventDefault();
    const nextQ = searchInput.trim();
    const nextTag = tagInput.trim();
    const nextParams = new URLSearchParams(searchParams);

    if (nextQ) {
      nextParams.set("q", nextQ);
    } else {
      nextParams.delete("q");
    }

    if (nextTag) {
      nextParams.set("tag", nextTag);
    } else {
      nextParams.delete("tag");
    }

    setSearchParams(nextParams);
  }

  function handleSortChange(event) {
    const nextSort = event.target.value;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("sort", nextSort);
    setSearchParams(nextParams);
  }

  const sortedResults = useMemo(() => {
    if (!enableSorting) {
      return results;
    }
    return sortQuestions(results, activeSort);
  }, [enableSorting, results, activeSort]);

  const visibleResults = useMemo(() => {
    const source = sortedResults;
    if (previewLimit) {
      return source.slice(0, previewLimit);
    }
    return source;
  }, [previewLimit, sortedResults]);

  const viewAllParams = new URLSearchParams();
  if (urlQ) {
    viewAllParams.set("q", urlQ);
  }
  if (urlTag) {
    viewAllParams.set("tag", urlTag);
  }
  if (enableSorting) {
    viewAllParams.set("sort", activeSort);
  }
  const viewAllLink = viewAllParams.toString() ? `/questions?${viewAllParams.toString()}` : "/questions";

  return (
    <section className="questions-panel">
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>

      <form className="so-search-form" onSubmit={handleSubmit}>
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search title or body..."
          aria-label="Search questions"
        />
        <input
          type="text"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          placeholder="Filter by tag (optional)"
          aria-label="Filter by tag"
        />
        <button type="submit">Search</button>
      </form>

      {enableSorting && (
        <div className="feed-toolbar">
          <label htmlFor="question-sort">Sort by</label>
          <select id="question-sort" value={activeSort} onChange={handleSortChange}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="status loading">Loading questions...</p>}
      {error && <p className="status error">{error}</p>}

      <div className="question-list">
        {visibleResults.map((item) => (
          <article key={item.id} className="question-row">
            <div className="question-stats">
              <p>
                <strong>{item.score}</strong> votes
              </p>
              <p>
                <strong>{item.answerCount}</strong> answers
              </p>
              <p>
                <strong>{item.views || 0}</strong> views
              </p>
            </div>
            <div className="question-content">
              <h3>
                <Link to={`/question/${item.id}`}>{item.title}</Link>
              </h3>
              <div className="tag-row">
                {item.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="question-date">
                asked by {item.askedBy || "anonymous"} • {formatCreatedAt(item.createdAt)}
              </p>
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && visibleResults.length === 0 && (
        <p className="status empty">No questions found for this search.</p>
      )}

      {previewLimit && sortedResults.length > previewLimit && (
        <p className="preview-link-wrap">
          <Link to={viewAllLink}>
            View all questions
          </Link>
        </p>
      )}
    </section>
  );
}

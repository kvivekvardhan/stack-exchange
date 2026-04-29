import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchQuestions } from "../api";
import QueryInspector from "./QueryInspector";

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
      return (left.viewCount || 0) - (right.viewCount || 0);
    }
    if (sortValue === "views_desc") {
      return (right.viewCount || 0) - (left.viewCount || 0);
    }

    const leftTime = new Date(left.creationDate).getTime() || 0;
    const rightTime = new Date(right.creationDate).getTime() || 0;
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
  const [meta, setMeta] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    setOffset(0);
    setResults([]);
    setHasMore(true);
  }, [urlQ, urlTag, activeSort]);

  useEffect(() => {
    setSearchInput(urlQ);
  }, [urlQ]);

  useEffect(() => {
    setTagInput(urlTag);
  }, [urlTag]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function fetchResults() {
      if (offset === 0) setLoading(true);
      setError("");

      try {
        const limit = previewLimit || 25;
        const response = await searchQuestions(
          { q: urlQ.trim(), tag: urlTag.trim(), sort: activeSort, limit, offset },
          { signal: controller.signal }
        );
        if (active) {
          if (offset === 0) {
            setResults(response.data);
          } else {
            setResults(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newItems = response.data.filter(p => !existingIds.has(p.id));
              return [...prev, ...newItems];
            });
          }
          setHasMore(response.data.length === limit);
          setMeta(response.meta || null);
        }
      } catch (requestError) {
        if (requestError?.name === "AbortError") {
          return;
        }
        if (active) {
          setError(requestError.message);
          if (offset === 0) setResults([]);
          setMeta(null);
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
      controller.abort();
    };
  }, [urlQ, urlTag, activeSort, offset, previewLimit]);

  useEffect(() => {
    if (!hasMore || loading || previewLimit) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setOffset((prev) => prev + 25);
      }
    });
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, previewLimit]);

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
    return results; // Backend handles sorting dynamically now
  }, [results]);

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
                <strong>{item.viewCount || 0}</strong> views
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
                asked by {item.ownerDisplayName || "anonymous"} • {formatCreatedAt(item.creationDate)}
              </p>
            </div>
          </article>
        ))}
      </div>

      {!previewLimit && hasMore && (
        <div ref={loadMoreRef} className="load-more-trigger" style={{ padding: "20px 0", textAlign: "center" }}>
          {loading && offset > 0 && <span className="status loading">Loading more questions...</span>}
        </div>
      )}

      {!loading && !error && visibleResults.length === 0 && (
        <p className="status empty">No questions found for this search.</p>
      )}

      {previewLimit && sortedResults.length > 0 && (
        <p className="preview-link-wrap">
          <Link to={viewAllLink}>
            View all questions
          </Link>
        </p>
      )}

      {meta?.inspector && meta.inspector.length > 0 && (
        <QueryInspector inspector={meta.inspector} />
      )}
    </section>
  );
}

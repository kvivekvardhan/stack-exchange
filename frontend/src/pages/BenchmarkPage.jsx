import { useEffect, useRef, useState } from "react";
import { getBenchmark } from "../api";
import QueryInspector from "../components/QueryInspector";

export default function BenchmarkPage() {
  const [search, setSearch] = useState("postgres");
  const [tag, setTag] = useState("sql");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [benchmark, setBenchmark] = useState(null);
  const [meta, setMeta] = useState(null);
  const abortRef = useRef(null);

  async function fetchBenchmark(params) {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const response = await getBenchmark(params, { signal: controller.signal });
      if (abortRef.current !== controller) {
        return;
      }
      setBenchmark(response.data);
      setMeta(response.meta || null);
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        return;
      }
      if (abortRef.current !== controller) {
        return;
      }
      setError(requestError.message);
      setBenchmark(null);
      setMeta(null);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    fetchBenchmark({ q: search, tag });
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    fetchBenchmark({ q: search, tag });
  }

  const baseline = benchmark?.baseline || [];
  const vectorized = benchmark?.vectorized || [];

  return (
    <section className="benchmark-page">
      <header className="panel-header">
        <div>
          <h2>Benchmark Comparison</h2>
          <p>Compare baseline and vectorized PostgreSQL timings.</p>
        </div>
      </header>

      <form className="so-search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search term"
          aria-label="Search term"
        />
        <input
          type="text"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder="Tag filter"
          aria-label="Tag filter"
        />
        <button type="submit">Run benchmark</button>
      </form>

      {loading && <p className="status loading">Running benchmark...</p>}
      {error && <p className="status error">{error}</p>}

      {!loading && !error && benchmark && (
        <div className="benchmark-table">
          <div className="benchmark-row header">
            <span>Query</span>
            <span>Baseline (ms)</span>
            <span>Vectorized (ms)</span>
            <span>Speedup</span>
          </div>
          {baseline.map((item, index) => {
            const vector = vectorized[index];
            const speedup =
              vector && vector.timingMs > 0
                ? (item.timingMs / vector.timingMs).toFixed(2)
                : "-";
            return (
              <div key={item.name} className="benchmark-row">
                <span>{item.name}</span>
                <span>{item.timingMs.toFixed(3)}</span>
                <span>{vector ? vector.timingMs.toFixed(3) : "-"}</span>
                <span>{speedup}x</span>
              </div>
            );
          })}
        </div>
      )}

      {meta?.inspector && meta.inspector.length > 0 && (
        <QueryInspector title="Benchmark Plans" inspector={meta.inspector} />
      )}
    </section>
  );
}

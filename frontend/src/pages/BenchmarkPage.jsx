import { useEffect, useRef, useState } from "react";
import { getBenchmark } from "../api";
import QueryInspector from "../components/QueryInspector";

export default function BenchmarkPage() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
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
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (!search.trim() && !tag.trim()) {
      setError("Please enter a search term or a tag filter to run the benchmark.");
      return;
    }
    fetchBenchmark({ q: search, tag });
  }

  const baseline = benchmark?.baseline || [];
  const vectorized = benchmark?.vectorized || [];
  const benchRuns = meta?.benchRuns || 3;

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

      {loading && (
        <p className="status loading">
          Running benchmark — each engine runs {benchRuns} times sequentially with cache flush between runs.
          This takes ~20–40s. Please wait…
        </p>
      )}
      {error && <p className="status error">{error}</p>}

      {!loading && !error && benchmark && (
        <>
          <p className="status" style={{ fontSize: "0.85em", color: "var(--color-text-muted, #888)", marginBottom: "0.5rem" }}>
            Median of {benchRuns} runs per query. Cache flushed (DISCARD ALL) before each run.
            Parallelism disabled for fair comparison.
          </p>
          <div className="benchmark-table">
            <div className="benchmark-row header">
              <span>Query</span>
              <span>Baseline median (ms)</span>
              <span>Vectorized median (ms)</span>
              <span>Speedup</span>
              <span>Baseline runs (ms)</span>
              <span>Vectorized runs (ms)</span>
            </div>
            {baseline.map((item, index) => {
              const vector = vectorized[index];
              const speedup =
                vector && vector.timingMs > 0
                  ? (item.timingMs / vector.timingMs).toFixed(2)
                  : "-";
              const baseRuns = item.allRuns ? item.allRuns.map(t => t.toFixed(1)).join(" / ") : "-";
              const vecRuns = vector?.allRuns ? vector.allRuns.map(t => t.toFixed(1)).join(" / ") : "-";
              const speedupNum = parseFloat(speedup);
              const speedupColor =
                isNaN(speedupNum) ? "inherit"
                : speedupNum >= 2 ? "#2a9d8f"
                : speedupNum >= 1.2 ? "#e9c46a"
                : "#e76f51";
              return (
                <div key={item.name} className="benchmark-row">
                  <span>{item.name}</span>
                  <span>{item.timingMs.toFixed(3)}</span>
                  <span>{vector ? vector.timingMs.toFixed(3) : "-"}</span>
                  <span style={{ fontWeight: "bold", color: speedupColor }}>{speedup}x</span>
                  <span style={{ fontSize: "0.8em", color: "var(--color-text-muted, #888)" }}>{baseRuns}</span>
                  <span style={{ fontSize: "0.8em", color: "var(--color-text-muted, #888)" }}>{vecRuns}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {meta?.inspector && meta.inspector.length > 0 && (
        <QueryInspector title="Benchmark Plans" inspector={meta.inspector} />
      )}
    </section>
  );
}

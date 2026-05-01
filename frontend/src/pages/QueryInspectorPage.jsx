import { useEffect, useRef, useState } from "react";
import { inspectQuery } from "../api";

const EXAMPLE_QUERIES = [
  "SELECT COUNT(*) FROM posts WHERE viewcount > 100",
  "SELECT posttypeid, AVG(score) FROM posts WHERE viewcount > 100 GROUP BY posttypeid",
  "SELECT posttypeid, AVG(score), COUNT(*) FROM posts WHERE viewcount > 500 GROUP BY posttypeid",
  "SELECT AVG(score) FROM posts WHERE score > 10"
];

function PlanNode({ line, index }) {
  const isVectorized = line.includes("Vectorized Seq Scan");
  const isSeqScan = !isVectorized && line.includes("Seq Scan");
  return (
    <div className={`plan-line ${isVectorized ? "plan-vectorized" : ""} ${isSeqScan ? "plan-seqscan" : ""}`}>
      {isVectorized && <span className="plan-badge vec-badge">⚡ VECTORIZED</span>}
      <code>{line}</code>
    </div>
  );
}

function TimingBar({ label, value, maxValue, color }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="timing-bar-wrap">
      <span className="timing-bar-label">{label}</span>
      <div className="timing-bar-track">
        <div className="timing-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="timing-bar-value">{value.toFixed(2)} ms</span>
    </div>
  );
}

function FilterMeter({ passed, filtered }) {
  const total = (passed || 0) + (filtered || 0);
  if (total === 0) return null;
  const pct = ((filtered / total) * 100).toFixed(1);
  return (
    <div className="filter-meter">
      <div className="filter-meter-header">
        <span className="filter-meter-title">Filter Efficiency</span>
        <span className="filter-meter-pct">{pct}% filtered</span>
      </div>
      <div className="filter-meter-track">
        <div className="filter-meter-passed" style={{ width: `${((passed / total) * 100).toFixed(1)}%` }} />
        <div className="filter-meter-filtered" style={{ width: `${pct}%` }} />
      </div>
      <div className="filter-meter-legend">
        <span className="legend-passed">● {(passed || 0).toLocaleString()} passed</span>
        <span className="legend-filtered">● {(filtered || 0).toLocaleString()} filtered</span>
      </div>
    </div>
  );
}

export default function QueryInspectorPage() {
  const [sql, setSql] = useState(EXAMPLE_QUERIES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  async function runInspect(querySql) {
    const trimmed = (querySql || sql).trim();
    if (!trimmed) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const response = await inspectQuery(trimmed, { signal: controller.signal });
      if (abortRef.current !== controller) return;
      setResult(response);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (abortRef.current !== controller) return;
      setError(err.message);
      setResult(null);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  function handleRun(e) {
    e.preventDefault();
    runInspect(sql);
  }

  const baseline = result?.data?.baseline;
  const vectorized = result?.data?.vectorized;
  const speedup = result?.meta?.speedup;
  const maxTime = Math.max(baseline?.execMs || 0, vectorized?.execMs || 0);

  return (
    <section className="inspector-page">
      <header className="panel-header">
        <div>
          <h2>Query Inspector</h2>
          <p>Run SQL queries against both engines and compare execution plans side-by-side.</p>
        </div>
      </header>

      <form className="inspector-form" onSubmit={handleRun}>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="Enter a SELECT query..."
          rows={3}
          className="inspector-sql-input"
        />
        <div className="inspector-form-actions">
          <button type="submit" disabled={loading}>
            {loading ? "Running..." : "⚡ Inspect Query"}
          </button>
          <div className="example-queries">
            <span className="example-label">Examples:</span>
            {EXAMPLE_QUERIES.map((q, i) => (
              <button
                key={i}
                type="button"
                className="example-btn"
                onClick={() => { setSql(q); runInspect(q); }}
                title={q}
              >
                Q{i + 1}
              </button>
            ))}
          </div>
        </div>
      </form>

      {error && <p className="status error">{error}</p>}

      {result && baseline && vectorized && (
        <div className="inspector-results">
          {/* Timing Comparison */}
          <div className="inspector-section timing-section">
            <h3>Timing Comparison</h3>
            <div className="timing-bars">
              <TimingBar label="Baseline" value={baseline.execMs} maxValue={maxTime} color="#6c757d" />
              <TimingBar label="Vectorized" value={vectorized.execMs} maxValue={maxTime} color="#f48024" />
            </div>
            {speedup && (
              <div className={`speedup-badge ${speedup >= 1 ? "speedup-fast" : "speedup-slow"}`}>
                {speedup >= 1 ? "🚀" : "🐢"} {speedup}x {speedup >= 1 ? "faster" : "slower"}
              </div>
            )}
          </div>

          {/* Scan Details */}
          <div className="inspector-section">
            <h3>Scan Details</h3>
            <div className="scan-comparison">
              <div className="scan-card">
                <h4>Baseline</h4>
                <div className="scan-stats">
                  <div className="scan-stat">
                    <span className="scan-stat-label">Rows Scanned</span>
                    <span className="scan-stat-value">{(baseline.estimatedRows ?? baseline.rowCount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="scan-stat">
                    <span className="scan-stat-label">Scan</span>
                    <span className="scan-stat-value">{baseline.isVectorized ? "Vectorized" : "Standard"}</span>
                  </div>
                </div>
                {baseline.filteredRows != null && (
                  <FilterMeter
                    passed={baseline.estimatedRows || 0}
                    filtered={baseline.filteredRows || 0}
                  />
                )}
              </div>

              <div className="scan-card vectorized-card">
                <h4>
                  Vectorized
                  {vectorized.isVectorized && (
                    <span className="plan-badge vec-badge" style={{ marginLeft: "0.5rem" }}>⚡</span>
                  )}
                </h4>
                <div className="scan-stats">
                  <div className="scan-stat">
                    <span className="scan-stat-label">Rows Scanned</span>
                    <span className="scan-stat-value">{(vectorized.estimatedRows ?? vectorized.rowCount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="scan-stat">
                    <span className="scan-stat-label">Scan</span>
                    <span className="scan-stat-value">{vectorized.isVectorized ? "Vectorized" : "Standard"}</span>
                  </div>
                </div>
                {vectorized.filteredRows != null && (
                  <FilterMeter
                    passed={vectorized.estimatedRows || 0}
                    filtered={vectorized.filteredRows || 0}
                  />
                )}
                {vectorized.filteredRows == null && (
                  <p className="inspector-params">
                    Estimated plan only; actual filter counts are unavailable for vectorized scans.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Plans side-by-side */}
          <div className="inspector-section">
            <h3>Execution Plans</h3>
            <div className="plan-comparison">
              <div className="plan-pane">
                <h4>Baseline Plan</h4>
                {baseline.plan ? (
                  <div className="plan-tree">
                    {baseline.plan.split("\n").map((line, i) => (
                      <PlanNode key={i} line={line} index={i} />
                    ))}
                  </div>
                ) : (
                  <p className="plan-empty">No plan available</p>
                )}
              </div>

              <div className="plan-pane">
                <h4>Vectorized Plan</h4>
                {vectorized.plan ? (
                  <div className="plan-tree">
                    {vectorized.plan.split("\n").map((line, i) => (
                      <PlanNode key={i} line={line} index={i} />
                    ))}
                  </div>
                ) : (
                  <p className="plan-empty">No plan available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

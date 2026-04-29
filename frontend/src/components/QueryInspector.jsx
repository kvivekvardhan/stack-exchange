import { useState } from "react";

function PlanNode({ line, index }) {
  const isVectorized = line.includes("Vectorized Seq Scan");
  const isSeqScan = !isVectorized && line.includes("Seq Scan");

  return (
    <div
      key={index}
      className={`plan-line ${isVectorized ? "plan-vectorized" : ""} ${isSeqScan ? "plan-seqscan" : ""}`}
    >
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
        <div
          className="timing-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="timing-bar-value">{value.toFixed(2)} ms</span>
    </div>
  );
}

function FilterEfficiency({ passed, filtered }) {
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
        <div
          className="filter-meter-passed"
          style={{ width: `${((passed / total) * 100).toFixed(1)}%` }}
        />
        <div
          className="filter-meter-filtered"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="filter-meter-legend">
        <span className="legend-passed">● {(passed || 0).toLocaleString()} passed</span>
        <span className="legend-filtered">● {(filtered || 0).toLocaleString()} filtered</span>
      </div>
    </div>
  );
}

export default function QueryInspector({ title = "Query Inspector", inspector = [] }) {
  const [expandedCards, setExpandedCards] = useState({});

  if (!inspector.length) {
    return null;
  }

  function toggleCard(name) {
    setExpandedCards((prev) => ({
      ...prev,
      [name]: !prev[name]
    }));
  }

  return (
    <section className="inspector-panel">
      <details open>
        <summary>{title}</summary>
        <div className="inspector-list">
          {inspector.map((entry) => {
            const expanded = expandedCards[entry.name] !== false;
            const planLines = entry.plan ? entry.plan.split("\n") : [];
            const hasVectorized = entry.plan
              ? entry.plan.includes("Vectorized Seq Scan")
              : false;

            return (
              <article key={entry.name} className="inspector-card">
                <div className="inspector-card-header" onClick={() => toggleCard(entry.name)}>
                  <h4>
                    {entry.name}
                    {hasVectorized && (
                      <span className="plan-badge vec-badge" style={{ marginLeft: "0.5rem" }}>
                        ⚡ VECTORIZED
                      </span>
                    )}
                  </h4>
                  <span className="inspector-toggle-icon">{expanded ? "▾" : "▸"}</span>
                </div>

                {expanded && (
                  <>
                    <p className="inspector-label">SQL</p>
                    <pre>{entry.sql}</pre>

                    {entry.params?.length ? (
                      <p className="inspector-params">
                        Params: {entry.params.map((v) => JSON.stringify(v)).join(", ")}
                      </p>
                    ) : null}

                    {entry.plan ? (
                      <>
                        <p className="inspector-label">Execution Plan</p>
                        <div className="plan-tree">
                          {planLines.map((line, i) => (
                            <PlanNode key={i} line={line} index={i} />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </details>
    </section>
  );
}

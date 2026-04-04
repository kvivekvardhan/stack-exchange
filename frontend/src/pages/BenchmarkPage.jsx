import { useEffect, useState } from "react";
import { getBenchmark } from "../api";

export default function BenchmarkPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;

    async function fetchBenchmark() {
      try {
        const response = await getBenchmark();
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

    fetchBenchmark();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <p className="status loading">Loading benchmark data...</p>;
  }

  if (error) {
    return <p className="status error">{error}</p>;
  }

  return (
    <section>
      <h2>Benchmark Comparison</h2>
      <p className="page-lead">
        Placeholder view for baseline versus vectorized engine timings.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Baseline (ms)</th>
              <th>Vectorized (ms)</th>
              <th>Speedup</th>
            </tr>
          </thead>
          <tbody>
            {payload.data.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.baselineMs}</td>
                <td>{row.vectorizedMs}</td>
                <td>{row.speedup}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="query-card">
        <h3>Query Inspector (placeholder)</h3>
        <pre>{payload.queryInspector.sql}</pre>
      </section>
    </section>
  );
}

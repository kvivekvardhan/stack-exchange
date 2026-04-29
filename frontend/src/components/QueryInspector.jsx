export default function QueryInspector({ title = "Query Inspector", inspector = [] }) {
  if (!inspector.length) {
    return null;
  }

  return (
    <section className="inspector-panel">
      <details open>
        <summary>{title}</summary>
        <div className="inspector-list">
          {inspector.map((entry) => (
            <article key={entry.name} className="inspector-card">
              <h4>{entry.name}</h4>
              <p className="inspector-label">SQL</p>
              <pre>{entry.sql}</pre>
              {entry.params?.length ? (
                <p className="inspector-params">
                  Params: {entry.params.map((value) => JSON.stringify(value)).join(", ")}
                </p>
              ) : null}
              {entry.plan ? (
                <>
                  <p className="inspector-label">Plan</p>
                  <pre>{entry.plan}</pre>
                </>
              ) : null}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

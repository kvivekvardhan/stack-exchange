import { NavLink } from "react-router-dom";

function navClassName({ isActive }) {
  return isActive ? "nav-link active" : "nav-link";
}

export default function Layout({ engine, onEngineChange, children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand-kicker">CS349 checkpoint prototype</p>
          <h1 className="brand-title">StackFast</h1>
        </div>
        <div className="engine-panel">
          <label htmlFor="engine-select">Engine</label>
          <select
            id="engine-select"
            value={engine}
            onChange={(event) => onEngineChange(event.target.value)}
          >
            <option value="baseline">Baseline PostgreSQL</option>
            <option value="vectorized">Vectorized PostgreSQL</option>
          </select>
        </div>
      </header>

      <nav className="nav-row">
        <NavLink to="/" className={navClassName} end>
          Search
        </NavLink>
        <NavLink to="/tags" className={navClassName}>
          Tags
        </NavLink>
        <NavLink to="/benchmark" className={navClassName}>
          Benchmark
        </NavLink>
      </nav>

      <main className="page-content">{children}</main>
    </div>
  );
}

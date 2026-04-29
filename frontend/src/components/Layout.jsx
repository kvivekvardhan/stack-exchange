import { NavLink } from "react-router-dom";
import { useEngineSettings } from "../EngineContext";

function navClassName({ isActive }) {
  return isActive ? "sidebar-link active" : "sidebar-link";
}

export default function Layout({ children }) {
  const { engine, inspect, setEngine, setInspect } = useEngineSettings();

  return (
    <div className="so-app">
      <header className="so-topbar">
        <div className="so-topbar-inner">
          <div className="so-logo-wrap">
            <span className="logo-bars" aria-hidden="true">
              ///
            </span>
            <h1>StackFast</h1>
          </div>
          <p className="so-tagline">Developer Q&A</p>
          <div className="engine-toggle">
            <label htmlFor="engine-select">Engine</label>
            <select
              id="engine-select"
              value={engine}
              onChange={(event) => setEngine(event.target.value)}
            >
              <option value="baseline">Baseline</option>
              <option value="vectorized">Vectorized</option>
            </select>
            <label className="inspect-toggle">
              <input
                type="checkbox"
                checked={inspect}
                onChange={(event) => setInspect(event.target.checked)}
              />
              Inspect
            </label>
          </div>
        </div>
      </header>
      <div className="so-layout">
        <aside className="so-sidebar" aria-label="Main navigation">
          <nav className="sidebar-nav">
            <NavLink to="/" className={navClassName} end>
              Home
            </NavLink>
            <NavLink to="/questions" className={navClassName}>
              Questions
            </NavLink>
            <NavLink to="/tags" className={navClassName}>
              Tags
            </NavLink>
            <NavLink to="/benchmark" className={navClassName}>
              Benchmark
            </NavLink>
          </nav>
        </aside>
        <main className="so-main">{children}</main>
      </div>
    </div>
  );
}

import { NavLink } from "react-router-dom";

function navClassName({ isActive }) {
  return isActive ? "sidebar-link active" : "sidebar-link";
}

export default function Layout({ children }) {
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
          </nav>
        </aside>
        <main className="so-main">{children}</main>
      </div>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import Logo from "./Logo";

const linkClass = ({ isActive }) => `bb-navlink ${isActive ? "active" : ""}`;

export default function AppShell({ children, maxWidth = "max-w-6xl" }) {
  return (
    <div className="min-h-screen">
      <header className="bb-header">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/expenses" className={linkClass}>Expenses</NavLink>
            <NavLink to="/profile" className={linkClass}>Profile</NavLink>
            <span className="w-px h-5 mx-2" style={{ background: "var(--line)" }} aria-hidden="true" />
            <NavLink to="/logout" className="bb-navlink">Log out</NavLink>
          </nav>
        </div>
      </header>
      <main className={`${maxWidth} mx-auto px-5 sm:px-8 py-8 sm:py-10`}>{children}</main>
    </div>
  );
}
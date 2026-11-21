import { Link } from "react-router-dom";

export function LogoMark({ size = 28, light = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill={light ? "#ffffff" : "#0a6b50"} />
      <rect x="7" y="14" width="3.5" height="7" rx="1.2" fill={light ? "#0a6b50" : "#fff"} opacity="0.6" />
      <rect x="12.25" y="10" width="3.5" height="11" rx="1.2" fill={light ? "#0a6b50" : "#fff"} opacity="0.8" />
      <rect x="17.5" y="6" width="3.5" height="15" rx="1.2" fill={light ? "#0a6b50" : "#fff"} />
    </svg>
  );
}

export default function Logo({ to = "/expenses", light = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 no-underline" aria-label="BudgetBuddy home">
      <LogoMark light={light} />
      <span
        className="bb-display text-[1.125rem] font-semibold"
        style={{ color: light ? "#fff" : "var(--ink)" }}
      >
        BudgetBuddy
      </span>
    </Link>
  );
}
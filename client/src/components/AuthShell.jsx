import Logo from "./Logo";

const POINTS = [
  "Set a monthly budget and see what’s left at a glance",
  "Log expenses in seconds, saved automatically",
  "Get a short written summary of where your money went",
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <aside
        className="hidden lg:flex flex-col justify-between p-14"
        style={{ background: "var(--ink)", color: "#fff" }}
      >
        <Logo to="/" light />
        <div className="max-w-md">
          <h2 className="bb-display text-[2.5rem] leading-[1.1] font-semibold m-0" style={{ color: "#ffffff" }}>
            Know where your money goes, every month.
          </h2>
          <ul className="mt-9 p-0 list-none space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-[0.9375rem]" style={{ color: "rgba(255,255,255,0.78)" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0 mt-0.5" aria-hidden="true">
                  <circle cx="10" cy="10" r="10" fill="rgba(255,255,255,0.12)" />
                  <path d="M6 10.3l2.7 2.7L14 7.5" fill="none" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm m-0" style={{ color: "rgba(255,255,255,0.5)" }}>
          © {new Date().getFullYear()} BudgetBuddy
        </p>
      </aside>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="lg:hidden mb-10"><Logo to="/" /></div>
        <div className="w-full max-w-[380px] mx-auto lg:mx-0 lg:ml-[12%]">
          <h1 className="bb-display bb-h1 m-0">{title}</h1>
          {subtitle && <p className="mt-2 mb-8 bb-muted">{subtitle}</p>}
          {children}
          {footer && <p className="mt-7 text-sm bb-muted">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
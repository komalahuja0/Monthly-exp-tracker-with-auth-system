import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { currency, initials } from "../utils/format";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    const load = async () => {
      try {
        const res = await axios.get(`${API}/api/auth/profile`, { headers });
        setUser(res.data.user);
      } catch (error) {
        console.log(error);
        navigate("/login");
        return;
      }
      try {
        const res = await axios.get(`${API}/api/expenses`, { headers });
        const all = res.data.expenses || [];
        const totalSpent = all.reduce(
          (sum, m) => sum + (m.entries || []).reduce((s, e) => s + (e.amount || 0), 0),
          0
        );
        const totalBudget = all.reduce((sum, m) => sum + (m.budget || 0), 0);
        setStats({ months: all.length, totalSpent, totalBudget });
      } catch (error) {
        console.log(error);
        setStats({ months: 0, totalSpent: 0, totalBudget: 0 });
      }
    };
    load();
  }, [navigate]);

  return (
    <AppShell maxWidth="max-w-3xl">
      <div className="mb-8">
        <h1 className="bb-display bb-h1 m-0">Profile</h1>
        <p className="mt-1.5 mb-0 bb-muted">Your account details and a summary of your tracking.</p>
      </div>

      <section className="bb-card p-6 sm:p-7 flex items-center gap-5">
        {user ? (
          <>
            <div
              className="bb-display shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              aria-hidden="true"
            >
              {initials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="bb-display m-0 text-[1.25rem] font-semibold truncate">{user.name}</p>
              <p className="m-0 bb-muted truncate">{user.email}</p>
            </div>
          </>
        ) : (
          <>
            <div className="bb-skeleton w-16 h-16 rounded-full" />
            <div className="space-y-2 flex-1">
              <div className="bb-skeleton h-5 w-40" />
              <div className="bb-skeleton h-4 w-56" />
            </div>
          </>
        )}
      </section>

      <section className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5" aria-label="Tracking summary">
        {[
          { label: "Months tracked", value: stats ? String(stats.months) : null },
          { label: "Total budgeted", value: stats ? currency(stats.totalBudget) : null },
          { label: "Total spent", value: stats ? currency(stats.totalSpent) : null },
        ].map((s) => (
          <div key={s.label} className="bb-card p-5">
            <p className="bb-label m-0">{s.label}</p>
            {s.value === null ? (
              <div className="bb-skeleton h-7 w-24 mt-2" />
            ) : (
              <p className="bb-display bb-num m-0 mt-1 text-[1.5rem] font-semibold">{s.value}</p>
            )}
          </div>
        ))}
      </section>

      <section className="mt-5 bb-card p-6 sm:p-7 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="bb-h2 m-0">Account</h2>
          <p className="mt-1 mb-0 text-sm bb-muted">Sign out to end your session on this device.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/expenses" className="bb-btn bb-btn-primary bb-btn-sm">Open expenses</Link>
          <Link to="/logout" className="bb-btn bb-btn-secondary bb-btn-sm">Log out</Link>
        </div>
      </section>
    </AppShell>
  );
}

export default Profile;

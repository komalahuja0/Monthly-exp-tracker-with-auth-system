import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import AuthShell from "../components/AuthShell";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setLoading(true);
      await axios.post(`${API}/api/auth/register`, form);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn’t create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start tracking your monthly budget in under a minute."
      footer={
        <>
          Already have an account? <Link to="/login" className="bb-link">Sign in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="bb-field">
          <span>Full name</span>
          <input
            type="text"
            autoComplete="name"
            required
            placeholder="Your name"
            value={form.name}
            onChange={update("name")}
            className="bb-input"
          />
        </label>
        <label className="bb-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={form.email}
            onChange={update("email")}
            className="bb-input"
          />
        </label>
        <label className="bb-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="At least 6 characters"
            value={form.password}
            onChange={update("password")}
            className="bb-input"
          />
        </label>

        {error && <div className="bb-alert bb-alert-error" role="alert">{error}</div>}

        <button type="submit" disabled={loading} className="bb-btn bb-btn-primary w-full">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

export default Register;
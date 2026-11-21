import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import AuthShell from "../components/AuthShell";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setLoading(true);
      const res = await axios.post(`${API}/api/auth/login`, { email, password });
      localStorage.setItem("token", res.data.token);
      navigate("/expenses");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn’t sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue tracking your expenses."
      footer={
        <>
          New to BudgetBuddy? <Link to="/" className="bb-link">Create an account</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="bb-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bb-input"
          />
        </label>
        <label className="bb-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bb-input"
          />
        </label>

        {error && <div className="bb-alert bb-alert-error" role="alert">{error}</div>}

        <button type="submit" disabled={loading} className="bb-btn bb-btn-primary w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

export default Login;
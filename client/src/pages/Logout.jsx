import { useEffect } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";

function Logout() {
  useEffect(() => {
    localStorage.removeItem("token");
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5">
      <div className="mb-10"><Logo to="/login" /></div>
      <div className="bb-card w-full max-w-[400px] p-9 text-center">
        <div
          className="mx-auto mb-5 w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent-soft)" }}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 22 22">
            <path d="M5 11.5l4 4 8-9" fill="none" stroke="#0a6b50" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="bb-display bb-h1 m-0 text-[1.5rem]">You’ve been signed out</h1>
        <p className="mt-2 mb-7 bb-muted">Your session has ended on this device. Your data is saved and waiting for you.</p>
        <Link to="/login" className="bb-btn bb-btn-primary w-full">Sign in again</Link>
      </div>
    </div>
  );
}

export default Logout;
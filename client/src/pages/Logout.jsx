import { useEffect } from "react";
import { useNavigate,Link } from "react-router-dom";
function Logout() {
  const navigate = useNavigate();
  useEffect(() => {
    localStorage.removeItem("token");
    setTimeout(() => {
      navigate("/");
    }, 2000);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-100 to-purple-100">
      <h1>Logging Out...</h1>
      <p>You have been logged out successfully!</p>
       <button> Click to register{" "} <Link to ="/" className="text-blue-500 font-semibold hover:text-red-500 transition duration-300">Register</Link></button>
    </div>
  );
}
export default Logout;
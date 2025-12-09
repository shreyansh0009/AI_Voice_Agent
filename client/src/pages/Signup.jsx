import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import api from "../utils/api";
import { Eye, EyeOff, LayoutGrid } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const from = location.state?.from?.pathname || "/";

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        setLoading(true);
        await auth.googleLogin(tokenResponse.access_token, true);
        setLoading(false);
        navigate(from, { replace: true });
      } catch (err) {
        setLoading(false);
        setError(err.response?.data?.message || "Google Signup failed");
      }
    },
    onError: () => setError("Google Signup Failed"),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      // Call the signup endpoint directly
      const res = await api.post("/api/auth/signup", { email, password });

      // Auto-login after signup by saving token
      if (res.data?.token) {
        const token = res.data.token;
        const role = res.data.role;

        localStorage.setItem("token", token);
        localStorage.setItem("role", role);

        setLoading(false);
        navigate(from, { replace: true });
        // Force reload to trigger auth context verification
        window.location.reload();
      } else {
        setError("Signup succeeded but no token received");
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || "Signup failed");
    }
  };

  const GoogleIcon = () => (
    <svg
      className="w-5 h-5 mr-2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-24 xl:px-32 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-12">
            <div className="bg-[#5c469c] p-1.5 rounded-lg">
              <LayoutGrid className="active font-bold text-xl text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              AI Voice Agent
            </span>
          </div>

          <h1 className="text-4xl font-bold mb-3 tracking-tight">
            Create an account
          </h1>
          <p className="text-gray-500 font-medium pb-4">
            Start your 30-day free trial.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#7F56D9] focus:ring-2 focus:ring-[#7F56D9]/20 outline-none transition-all placeholder:text-gray-400"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#7F56D9] focus:ring-2 focus:ring-[#7F56D9]/20 outline-none transition-all placeholder:text-gray-400"
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#7F56D9] focus:ring-2 focus:ring-[#7F56D9]/20 outline-none transition-all placeholder:text-gray-400"
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Must be at least 8 characters.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5c469c] text-white font-semibold py-3 rounded-lg hover:bg-[#4a387d] transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? "Creating account..." : "Get started"}
            </button>

            <button
              type="button"
              onClick={() => handleGoogleLogin()}
              className="w-full bg-white text-gray-700 font-semibold py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <GoogleIcon />
              Sign up with Google
            </button>
          </div>
        </form>

        <p className="text-center mt-8 text-gray-600 font-medium text-sm">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[#6941C6] hover:text-[#53389E] font-semibold transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>

      {/* Right Side - Image/Illustration */}
      <div className="hidden lg:flex w-1/2 bg-[#9c89b8] relative overflow-hidden items-center justify-center p-12">
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 text-white w-12 h-12 border-2 border-white rounded-full"></div>
          <div className="absolute bottom-40 right-20 text-white w-24 h-24 border-2 border-white rounded-lg rotate-12"></div>
          <div className="absolute top-1/2 left-1/3 text-white w-8 h-8 bg-white rounded-full opacity-50"></div>
        </div>

        {/* Main Content Area */}
        <div className="relative z-10 w-full max-w-lg aspect-square">
          {/* Abstract Representation of the User Image */}
          <div className="w-full h-full relative">
            {/* Monitor Frame */}
            <div className="absolute bottom-0 left-0 right-0 h-4/5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl overflow-hidden flex items-end justify-center">
              {/* Character (Abstract) */}
              <div className="w-64 h-80 bg-[#5c469c] rounded-t-full relative mb-[-40px]">
                {/* Head */}
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-32 h-40 bg-white rounded-full flex items-center justify-center">
                  {/* Headset */}
                  <div className="absolute -right-4 top-10 w-8 h-20 border-r-4 border-gray-800 rounded-full"></div>
                  <div className="w-4 h-4 bg-gray-800 rounded-full absolute -right-4 bottom-10"></div>
                </div>
                {/* Arm Waving */}
                <div className="absolute -right-16 top-10 w-24 h-40 bg-white rounded-full transform rotate-12">
                  <div className="absolute top-2 right-2 w-full h-full border-r-4 border-transparent"></div>{" "}
                  {/* Simulating hand */}
                </div>
              </div>
            </div>

            {/* Floating Icons */}
            <div className="absolute top-10 left-0 p-4 bg-white rounded-2xl shadow-lg animate-bounce duration-3000">
              <div className="w-8 h-8 rounded-full border-2 border-gray-200"></div>
            </div>
            <div className="absolute top-20 right-10 p-3 bg-white/90 rounded-full shadow-lg">
              <div className="w-6 h-6 border-2 border-[#5c469c] rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;

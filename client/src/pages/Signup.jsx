import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    console.log('🔵 SIGNUP FORM: Submitting', { 
      email, 
      passwordLength: password.length,
      passwordSample: password.substring(0, 3) + '***'
    });
    
    try {
      // Call the signup endpoint directly
      const res = await api.post('/api/auth/signup', { email, password });
      
      console.log('🔵 SIGNUP FORM: Response received', { 
        hasToken: !!res.data?.token,
        role: res.data?.role 
      });

      // Auto-login after signup by saving token
      if (res.data?.token) {
        const token = res.data.token;
        const role = res.data.role;
        
        localStorage.setItem('token', token);
        localStorage.setItem('role', role);
        console.log('💾 SIGNUP FORM: Saved to localStorage', { 
          token: token.substring(0, 20) + '...', 
          role 
        });
        
        console.log('✅ SIGNUP FORM: Success, navigating to', from);
        setLoading(false);
        navigate(from, { replace: true });
        // Force reload to trigger auth context verification
        window.location.reload();
      } else {
        console.error('❌ SIGNUP FORM: No token in response');
        setError('Signup succeeded but no token received');
        setLoading(false);
      }
    } catch (err) {
      console.error('❌ SIGNUP FORM: Error', {
        status: err.response?.status,
        message: err.response?.data?.message,
        error: err.message
      });
      setLoading(false);
      setError(err.response?.data?.message || 'Signup failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center">Sign Up</h2>
        {error && <div className="mb-4 text-red-500 text-sm">{error}</div>}
        <div className="mb-4">
          <label className="block mb-1 text-gray-700">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-3 py-2 border rounded" />
        </div>
        <div className="mb-6">
          <label className="block mb-1 text-gray-700">Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            className="w-full px-3 py-2 border rounded"
            placeholder="Min 8 chars, 1 letter, 1 number"
          />
          <p className="text-xs text-gray-500 mt-1">
            Password must be at least 8 characters with a letter and a number
          </p>
        </div>
        <button 
          type="submit" 
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed" 
          disabled={loading}
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>
        <p className="text-center mt-4">
          Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
        </p>
      </form>
    </div>
  );
};

export default Signup;

import axios from 'axios';

// In production, VITE_API_URL should be empty so requests use relative paths
// and nginx proxies /api → backend. Only set it in .env.local for local dev.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    // console.log('🔵 API REQUEST:', { 
    //   method: config.method?.toUpperCase(), 
    //   url: config.url,
    //   baseURL: config.baseURL,
    //   hasToken: !!token,
    //   tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
    // });

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // console.log('✅ API REQUEST: Token attached to Authorization header');
    } else {
      // console.log('⚠️ API REQUEST: No token found in localStorage');
    }

    return config;
  },
  (error) => {
    console.error('❌ API REQUEST ERROR:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    // console.log('✅ API RESPONSE:', {
    //   method: response.config.method?.toUpperCase(),
    //   url: response.config.url,
    //   status: response.status,
    //   hasData: !!response.data
    // });
    return response;
  },
  (error) => {
    console.error('❌ API RESPONSE ERROR:', {
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      data: error.response?.data
    });

    // If 401 Unauthorized, clear token
    if (error.response?.status === 401) {
      // console.log('🔴 401 Unauthorized: Clearing token from localStorage');
      localStorage.removeItem('token');
      localStorage.removeItem('role');

      // Optional: Only redirect if not already on login page
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
        // console.log('🔄 Redirecting to login page');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;

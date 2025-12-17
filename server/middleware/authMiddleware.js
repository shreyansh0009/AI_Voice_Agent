import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export const authenticate = async (req, res, next) => {
  // console.log('🔵 AUTH MIDDLEWARE: Starting authentication', {
  //   path: req.path,
  //   method: req.method,
  //   headers: req.headers
  // });
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  // console.log('🔵 AUTH MIDDLEWARE: Token extracted', { 
  //   token: token ? 'present' : 'missing',
  //   authHeader: authHeader ? 'present' : 'missing'
  // });
  
  if (!token) {
    // console.log('🔴 AUTH MIDDLEWARE: No token provided');
    return res.status(401).json({ message: 'No token provided.' });
  }
  
  try {
    // console.log('🔵 AUTH MIDDLEWARE: Verifying token');
    const payload = jwt.verify(token, JWT_SECRET);
    // console.log('✅ AUTH MIDDLEWARE: Token verified', { payload });
    req.user = payload;
    next();
  } catch (err) {
    console.error('❌ AUTH MIDDLEWARE: Token verification failed', {
      message: err.message,
      name: err.name
    });
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

export const authorize = (roles = []) => {
  if (typeof roles === 'string') roles = [roles];
  return (req, res, next) => {
    // console.log('🔵 AUTHORIZE MIDDLEWARE: Checking role', {
    //   userRole: req.user?.role,
    //   requiredRoles: roles
    // });
    
    if (!roles.length || roles.includes(req.user.role)) {
      // console.log('✅ AUTHORIZE MIDDLEWARE: Role authorized');
      return next();
    }
    
    // console.log('🔴 AUTHORIZE MIDDLEWARE: Insufficient role');
    return res.status(403).json({ message: 'Forbidden: insufficient role.' });
  };
};

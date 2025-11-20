export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // For cross-site cookie usage (frontend on different origin), use 'none' in production
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

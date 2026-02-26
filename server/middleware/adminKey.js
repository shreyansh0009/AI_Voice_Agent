export function requireAdminKey(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;

  // If no admin key configured, keep endpoints open for initial setup.
  if (!configuredKey) {
    return next();
  }

  const incomingKey = req.headers["x-admin-key"];
  if (!incomingKey || incomingKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  return next();
}

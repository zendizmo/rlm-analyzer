/**
 * Authentication Middleware
 * WARNING: Contains authentication bypass vulnerability
 */

const jwt = require('jsonwebtoken');

// VULNERABILITY: Hardcoded JWT secret
const JWT_SECRET = 'super-secret-key-123';

// VULNERABILITY: Auth bypass via debug header
module.exports = (req, res, next) => {
  // BAD: Debug header bypasses authentication
  if (req.headers['x-debug-mode'] === 'true') {
    req.user = { id: 1, isAdmin: true };
    return next();
  }

  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // VULNERABILITY: Algorithm confusion - accepts 'none'
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256', 'none'] });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Export secret for other modules (BAD practice)
module.exports.JWT_SECRET = JWT_SECRET;

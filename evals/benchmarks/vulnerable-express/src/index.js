/**
 * Express API Server
 * WARNING: This code contains intentional vulnerabilities for testing
 */

const express = require('express');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const authMiddleware = require('./middleware/auth');

const app = express();

// VULNERABILITY: No helmet, no rate limiting
app.use(express.json());

// Public routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);

// Protected routes (but auth is bypassable)
app.use('/api/admin', authMiddleware, require('./routes/admin'));

// VULNERABILITY: Verbose error messages in production
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: err.message,
    stack: err.stack  // Exposes stack trace to client
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

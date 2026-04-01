/**
 * User Routes
 * WARNING: Contains SQL injection vulnerability
 */

const express = require('express');
const router = express.Router();
const db = require('../models/db');

// VULNERABILITY: SQL Injection - user input directly in query
router.get('/search', async (req, res) => {
  const { username } = req.query;

  // BAD: String concatenation in SQL query
  const query = `SELECT * FROM users WHERE username = '${username}'`;

  try {
    const results = await db.query(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY: Mass assignment - no field filtering
router.post('/register', async (req, res) => {
  const userData = req.body; // Accepts any fields including isAdmin

  try {
    const result = await db.query(
      'INSERT INTO users SET ?',
      userData  // Could include isAdmin: true
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY: IDOR - no authorization check
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // Any user can access any other user's data
  const results = await db.query(
    'SELECT * FROM users WHERE id = ?',
    [id]
  );

  res.json(results[0]);
});

// VULNERABILITY: Weak password storage mentioned
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Using MD5 for password (weak)
  const crypto = require('crypto');
  const hashedPassword = crypto.createHash('md5').update(password).digest('hex');

  const results = await db.query(
    'SELECT * FROM users WHERE email = ? AND password = ?',
    [email, hashedPassword]
  );

  if (results.length > 0) {
    res.json({ token: 'dummy-token' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

module.exports = router;

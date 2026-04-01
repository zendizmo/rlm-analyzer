/**
 * Admin Routes
 * WARNING: Contains privilege escalation vulnerability
 */

const express = require('express');
const router = express.Router();
const db = require('../models/db');

// VULNERABILITY: No role check - any authenticated user can access
router.get('/users', async (req, res) => {
  // Should check: if (!req.user.isAdmin) return res.status(403)...
  const results = await db.query('SELECT * FROM users');
  res.json(results);
});

// VULNERABILITY: SSRF - user controls URL
router.post('/fetch-url', async (req, res) => {
  const { url } = req.body;
  const fetch = require('node-fetch');

  try {
    // BAD: Fetches any URL including internal services
    const response = await fetch(url);
    const data = await response.text();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VULNERABILITY: Unsafe deserialization
router.post('/import', (req, res) => {
  const { data } = req.body;

  try {
    // BAD: Using eval for JSON parsing (could be exploited)
    const parsed = eval('(' + data + ')');
    res.json({ imported: parsed });
  } catch (err) {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// VULNERABILITY: Missing CSRF protection on state-changing operation
router.post('/delete-user/:id', async (req, res) => {
  const { id } = req.params;

  // No CSRF token check
  await db.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;

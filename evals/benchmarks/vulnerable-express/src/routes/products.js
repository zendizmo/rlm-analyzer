/**
 * Product Routes
 * WARNING: Contains XSS and path traversal vulnerabilities
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../models/db');

// VULNERABILITY: Reflected XSS - user input in response without sanitization
router.get('/search', (req, res) => {
  const { q } = req.query;

  // BAD: Directly embedding user input in HTML response
  res.send(`
    <html>
      <body>
        <h1>Search Results for: ${q}</h1>
        <p>No products found matching "${q}"</p>
      </body>
    </html>
  `);
});

// VULNERABILITY: Path traversal - user controls file path
router.get('/image/:filename', (req, res) => {
  const { filename } = req.params;

  // BAD: No validation of filename, allows ../../../etc/passwd
  const filePath = path.join(__dirname, '../../uploads', filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// VULNERABILITY: NoSQL injection (if using MongoDB-style queries)
router.post('/filter', async (req, res) => {
  const { category, minPrice, maxPrice } = req.body;

  // BAD: User-controlled object in query
  const filter = req.body.filter || {};

  const results = await db.query('SELECT * FROM products WHERE ?', filter);
  res.json(results);
});

// VULNERABILITY: Command injection
router.post('/generate-report', (req, res) => {
  const { format } = req.body;
  const { exec } = require('child_process');

  // BAD: User input in shell command
  exec(`generate-report --format ${format}`, (err, stdout) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ report: stdout });
    }
  });
});

module.exports = router;

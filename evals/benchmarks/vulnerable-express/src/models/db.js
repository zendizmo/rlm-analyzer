/**
 * Database Connection
 * WARNING: Contains hardcoded credentials
 */

const mysql = require('mysql');

// VULNERABILITY: Hardcoded database credentials
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password123',  // Hardcoded password
  database: 'vulnerable_app'
});

connection.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to database');
});

module.exports = {
  query: (sql, params) => {
    return new Promise((resolve, reject) => {
      connection.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  },
  connection
};

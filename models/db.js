const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3307,
  user: 'root',
  password: 'r4?T2nHUXrx',
  database: 'fifa_tournament'
});

module.exports = pool.promise();

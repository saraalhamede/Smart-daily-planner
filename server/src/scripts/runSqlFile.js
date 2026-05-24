import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ override: true });

const [, , inputFile] = process.argv;

if (!inputFile) {
  console.error('Usage: node server/src/scripts/runSqlFile.js <sql-file>');
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sqlPath = path.resolve(projectRoot, inputFile);
const sql = await fs.readFile(sqlPath, 'utf8');

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number.parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
});

try {
  await connection.query(sql);
  console.log(`Applied SQL file: ${inputFile}`);
} finally {
  await connection.end();
}

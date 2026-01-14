import { applyCors } from "../../lib/cors.js";
import pool from "../../lib/db.js";

export default async function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
  return res.json({ categories: result.rows });
}
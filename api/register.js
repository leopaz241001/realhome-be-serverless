import pool from "../lib/db";
import bcrypt from 'bcrypt';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, password, name, phone } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, phone, role',
      [email, hash, name, phone, 'user']
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      console.error(error.message);
      res.status(400).json({ error: 'Email đã tồn tại!' });
    } else {
      console.error(error.message);
      res.status(500).json({ error: 'Đăng ký không thành công, hãy thử lại!' });
    }
  }
}
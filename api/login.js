import { applyCors } from "../lib/cors.js";
import pool from "../lib/db.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if(applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Email không tồn tại.' });
    }

    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ message: 'Mật khẩu không đúng.' });
    }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.setHeader(
      'Set-Cookie',
      `access_token=${accessToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`
    );

    res.json({ 
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Đăng nhập thất bại.', message: err.message });
  }
}
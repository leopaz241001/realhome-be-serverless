import { applyCors } from "../../lib/cors.js";
import pool from "../../lib/db.js";

export default async function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const user = await verifyToken(req, res);
  if (!user) return;

  const isAdmin = requireRole(user, res, "admin");
  if (!isAdmin) return res.status(401).json({ message: 'Bạn không có quyền thực hiện tác vụ này.' });

  const { name, division_type } = req.body;

  try {
    const result = await pool.query('INSERT INTO categories (name, division_type) VALUES ($1, $2) RETURNING *', [name, division_type]);
    return res.status(201).json({ message: 'Tạo mới thành công.', category: result.rows[0] });
  } catch (error) {
    console.error(error.message);

    if (error.code === '23505') {
      return res.status(400).json({ message: 'Danh mục đã tồn tại!' });
    } else {
      return res.status(500).json({ message: 'Tạo mới không thành công!' });
    }
  }
}
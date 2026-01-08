import { applyCors } from "../../lib/cors.js";
import pool from "../../lib/db.js";
import { verifyToken } from "../../middleware/auth.js";
import { supabase } from "../../middleware/upload.js";

export default async function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, name, phone, avatar } = req.body;
  const user = await verifyToken(req, res);
  const userId = user.id;

  try {
    // dynamic query
    let fields = [];
    let values = [];
    let index = 1;

    if (email) {
      fields.push(`email = $${index++}`);
      values.push(email);
    }
    if (name) {
      fields.push(`name = $${index++}`);
      values.push(name);
    }
    if (phone) {
      fields.push(`phone = $${index++}`);
      values.push(phone);
    }
    if (avatar) {
      // Lấy avatar hiện tại từ DB
      const current = await pool.query('SELECT avatar FROM users WHERE id = $1', [userId]);
      const currentAvatarUrl = current.rows[0]?.avatar;

      // Nếu có avatar cũ → xóa trong bucket
      if (currentAvatarUrl) {
        // tách tên file từ public URL 
        const oldFileName = currentAvatarUrl.split('/avatars/')[1]; 
        await supabase.storage.from('avatars').remove([oldFileName]);
      }

      fields.push(`avatar = $${index++}`);
      values.push(avatar);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu để cập nhật.' });
    }

    values.push(userId); // cuối cùng là id
    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING id, email, name, phone, avatar, role
    `;

    const result = await pool.query(query, values);

    res.json({ message: 'Cập nhật thành công.', user: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Cập nhật không thành công.' });
  }
}

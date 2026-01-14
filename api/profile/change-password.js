import { applyCors } from "../../lib/cors.js";
import pool from "../../lib/db.js";
import { verifyToken } from "../../middleware/auth.js";
import bcrypt from "bcrypt";

export default async function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = await verifyToken(req, res);
  const userId = user.id;

  try {
    // 1. Kiểm tra 3 field bắt buộc
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Nhập lại mật khẩu mới không khớp." });
    }

    // 2. Lấy password hiện tại trong DB
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại." });

    // 3. So sánh mật khẩu hiện tại
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Mật khẩu hiện tại không đúng." });
    }

    // 4. Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 5. Cập nhật vào DB
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedPassword, userId]);

    res.json({ message: "Thay đổi mật khẩu thành công." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi khi đổi mật khẩu." });
  }
}

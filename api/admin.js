import { applyCors } from "../lib/cors.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

export default async function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const user = await verifyToken(req, res);
  if (!user) return;

  const isAdmin = requireRole(user, res, "admin");
  if (!isAdmin) return res.status(401).json({ message: 'Bạn không có quyền thực hiện tác vụ này.' });

  return res.json({
    message: `Hello admin`,
  });
}
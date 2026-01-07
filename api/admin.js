import { verifyToken, requireRole } from "../middleware/auth.js";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const user = await verifyToken(req, res);
  if (!user) return;

  const isAdmin = requireRole(user, res, "admin");
  if (!isAdmin) return;

  return res.json({
    message: `Hello admin`,
  });
}
import { verifyToken } from "../../middleware/auth";
import { getProfile } from "../../controllers/auth.controller";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const user = await verifyToken(req, res);
  if (!user) return;

  // Truyền user vào controller
  return getProfile(req, res, user);
}

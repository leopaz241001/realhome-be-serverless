import { applyCors } from "../../lib/cors.js";
import { verifyToken } from "../../middleware/auth.js";

export default async function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const user = await verifyToken(req, res);
  if (!user) return;

  return res.json({
    message: `Hello ${user.name}`,
    user: user
  });
}

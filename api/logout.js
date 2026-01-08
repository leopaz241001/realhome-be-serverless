import { applyCors } from "../lib/cors";

export default function handler(req, res) {
  if(applyCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  res.setHeader(
    'Set-Cookie',
    'access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure'
  );

  res.json({ message: 'Đã đăng xuất.' });
}
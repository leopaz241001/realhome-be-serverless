export default function handler(req, res) {
  res.setHeader(
    'Set-Cookie',
    'access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure'
  );
  res.json({ message: 'Logged out' });
}
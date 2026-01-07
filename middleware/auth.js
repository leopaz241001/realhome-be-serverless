import pool from '../lib/db.js';
import jwt from 'jsonwebtoken';

function getCookie(req, name) {
    const cookies = req.headers.cookie; // `access_token=${accessToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`
    if (!cookies) return null;

    const match = cookies
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith(name + '='));

    return match ? match.split('=')[1] : null;
}

export async function verifyToken(req, res) {
    const token = getCookie(req, 'access_token');

    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);

        if (!rows.length) {
            res.status(404).json({ error: 'Người dùng không tồn tại.' });
            return null;
        }

        return rows[0];
    } catch (err) {
        res.status(403).json({ error: 'Invalid token' });
        return null;
    }
};

export function requireRole(user, res, ...roles) {
    if (!roles.includes(user.role)) {
        res.status(403).json({ error: 'Bạn không có quyền truy cập.' });
        return false;
    }
    return true;
}
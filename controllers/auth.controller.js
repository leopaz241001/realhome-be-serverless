import pool from '../lib/db';
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken';
// const { uploadToSupabase, supabase } = require('../middleware/upload');

export async function register(req, res) {
    const { email, password, name, phone } = req.body;

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, phone, role',
            [email, hash, name, phone, 'user']
        );

        res.status(201).json({ user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            console.error(error.message);
            res.status(400).json({ error: 'Email đã tồn tại!' });
        } else {
            console.error(error.message);
            res.status(500).json({ error: 'Đăng ký không thành công, hãy thử lại!' });
        }
    }
};

export async function login(req, res) {
    const { email, password } = req.body;

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Email không tồn tại.' });
        }

        const user = userResult.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid) {
            return res.status(401).json({ error: 'Mật khẩu không đúng.' });
        }

        const accessToken = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Set cookie HttpOnly thay vì trả token
        // res.cookie('access_token', accessToken, {
        //     httpOnly: true,
        //     secure: process.env.NODE_ENV === 'production', // chỉ bật secure trên HTTPS
        //     sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        //     maxAge: 24 * 60 * 60 * 1000 // 24h
        // });
        res.setHeader(
            'Set-Cookie',
            `access_token=${accessToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`
        );

        res.json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, avatar: user.avatar });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Đăng nhập thất bại.' });
    }
};

export async function logout(req, res) {
    res.clearCookie('access_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    });
    res.json({ message: 'Đã đăng xuất!' });
};

export async function getProfile(req, res, user) {
    try {
        const result = await pool.query('SELECT id, name, email, role, phone, avatar FROM users WHERE id = $1', [user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Người dùng không tồn tại.' });
        }

        res.json({
            message: `Hello ${result.rows[0].name}`,
            user: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Không thể lấy thông tin người dùng.' });
    }
};

// export async function updateProfile(req, res) {
//     const { email, name, phone } = req.body;
//     const userId = req.user.id;

//     try {
//         // dynamic query
//         let fields = [];
//         let values = [];
//         let index = 1;

//         if (email) {
//             fields.push(`email = $${index++}`);
//             values.push(email);
//         }
//         if (name) {
//             fields.push(`name = $${index++}`);
//             values.push(name);
//         }
//         if (phone) {
//             fields.push(`phone = $${index++}`);
//             values.push(phone);
//         }
//         // Thêm avatar
//         if (req.file) {
//             // Lấy avatar hiện tại từ DB
//             const current = await pool.query('SELECT avatar FROM users WHERE id = $1', [userId]);
//             const currentAvatarUrl = current.rows[0]?.avatar;

//             // Nếu có avatar cũ → xóa trong bucket
//             if (currentAvatarUrl) {
//                 // tách tên file từ public URL 
//                 const oldFileName = currentAvatarUrl.split('/avatars/')[1]; 
//                 await supabase.storage.from('avatars').remove([oldFileName]);
//             }
            
//             // Upload avatar mới lên Supabase
//             const avatarUrl = await uploadToSupabase('avatars', req.file);

//             // Cập nhật cột avatar bằng URL
//             fields.push(`avatar = $${index++}`);
//             values.push(avatarUrl);
//         }

//         if (fields.length === 0) {
//             return res.status(400).json({ error: 'Không có dữ liệu để cập nhật.' });
//         }

//         values.push(userId); // cuối cùng là id
//         const query = `
//             UPDATE users
//             SET ${fields.join(', ')}
//             WHERE id = $${index}
//             RETURNING id, email, name, phone, avatar, role
//         `;

//         const result = await pool.query(query, values);

//         res.json({ message: 'Cập nhật thành công.', user: result.rows[0] });
//     } catch (err) {
//         console.error(err.message);
//         res.status(500).json({ error: 'Cập nhật không thành công.' });
//     }
// };

export async function changePassword(req, res) {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    try {
        // 1. Kiểm tra 3 field bắt buộc
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: "Thiếu dữ liệu bắt buộc." });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: "Nhập lại mật khẩu mới không khớp." });
        }

        // 2. Lấy password hiện tại trong DB
        const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: "Người dùng không tồn tại." });

        // 3. So sánh mật khẩu hiện tại
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Mật khẩu hiện tại không đúng." });
        }

        // 4. Hash mật khẩu mới
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 5. Cập nhật vào DB
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedPassword, userId]);

        res.json({ message: "Thay đổi mật khẩu thành công." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi khi đổi mật khẩu." });
    }
};

export async function getAllUsers(req, res) {
    try {
        const result = await pool.query('SELECT id, email, name, phone, avatar, role FROM users ORDER BY id DESC');
        res.json({ users: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Không thể lấy danh sách người dùng." });
    }
};

export async function getUsersWithPagination(req, res) {
    const { page = 1, limit = 10, search = '' } = req.query;

    // Chuyển page, limit sang số
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const offset = (pageNumber - 1) * limitNumber;

    try {
        // Đếm tổng số user
        const countResult = await pool.query(`SELECT COUNT(*) FROM users WHERE name ILIKE $1 OR email ILIKE $1`, [`%${search}%`]);
        const totalUsers = parseInt(countResult.rows[0].count);

        // Lấy dữ liệu theo phân trang
        const result = await pool.query(`SELECT id, name, email, phone, avatar, role, created_at FROM users 
             WHERE name ILIKE $1 OR email ILIKE $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [`%${search}%`, limitNumber, offset]
        );

        res.json({
            total: totalUsers,
            page: pageNumber,
            limit: limitNumber,
            users: result.rows
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Không thể lấy danh sách người dùng." });
    }
};

export async function deleteUser(req, res) {
    const userId = parseInt(req.params.id);

    // Không cho phép xóa chính mình (nếu muốn an toàn)
    if (req.user.id === userId) {
        return res.status(400).json({ error: "Không thể xóa chính mình." });
    }

    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Người dùng không tồn tại.' });
        }

        res.json({ message: `Đã xóa người dùng ID ${userId}` });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Xóa người dùng không thành công.' });
    }
};

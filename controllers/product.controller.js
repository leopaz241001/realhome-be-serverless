import pool from '../lib/db';
const { uploadToSupabase, supabase } = require('../middleware/upload');
const cityData = require("../data/locations.json");
const { loadCategories } = require("../cache/categories");
const { loadTypes } = require("../cache/types");

const normalize = (str = "") => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const normalizeKeywords = (q = "") => normalize(q).split(/\s+/).filter(Boolean);
const normalizeCode = (q = "") => normalize(q).replace(/\s+/g, "_");

// Tạo sản phẩm
export async function createProduct(req, res) {
    const { title, description, category_id, type_id, rental_type, price, price_per_day, price_per_month, address, ward, city, latitude, longitude, area, bedrooms, bathrooms } = req.body;
    const userId = req.user.id;

    try {
        // Tạo sản phẩm
        const productResult = await pool.query(
            `INSERT INTO products 
            (title, description, user_id, category_id, type_id, rental_type, price, price_per_day, price_per_month, address, ward, city, latitude, longitude, area, bedrooms, bathrooms) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *
            `, [title, description, userId, category_id, type_id, rental_type, price, price_per_day, price_per_month, address, ward, city, latitude, longitude, area, bedrooms, bathrooms]);

        res.status(201).json({
            message: 'Tạo sản phẩm thành công',
            product: productResult.rows[0]
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Tạo sản phẩm không thành công.' });
    }
};

// Tạo ảnh sản phẩm
export async function uploadProductImg(req, res) {
    const productId = parseInt(req.params.id);

    try {
        // Kiểm tra product có tồn tại không
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.' });
        }

        // Lưu các ảnh
        const imageUrls = [];
        for (const file of req.files) {
            const productUrl = await uploadToSupabase('products', file);
            await pool.query('INSERT INTO product_images (product_id, image_url) VALUES ($1, $2)', [productId, productUrl]);
            imageUrls.push(productUrl);
        }

        res.status(201).json({
            message: 'Cập nhật hình ảnh sản phẩm thành công',
            images: imageUrls
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Cập nhật hình ảnh sản phẩm không thành công.' });
    }
};

// Lấy danh sách sản phẩm theo phân trang, filter (ai cũng xem được).
export async function getProducts(req, res) {
    let { page = 1, limit, sort, category_id, type_id, ward, city, minPrice, maxPrice, bedrooms, bathrooms, minSquare, maxSquare } = req.query;

    // Ép kiểu về số
    page = parseInt(page) > 0 ? parseInt(page) : 1;
    limit = parseInt(limit) > 0 ? parseInt(limit) : 12;
    const offset = (page - 1) * limit;

    const sortMap = {
        newest: "p.created_at DESC",
        oldest: "p.created_at ASC",
        price_asc: "COALESCE(p.price, p.price_per_day, p.price_per_month) ASC",
        price_desc: "COALESCE(p.price, p.price_per_day, p.price_per_month) DESC",
        rating_desc: "AVG(pr.rating) DESC",
    };

    const orderBy = sortMap[sort] || sortMap.newest;

    // Mảng chứa điều kiện WHERE
    const conditions = [];
    const values = [];
    let valueIndex = 1;

    if (category_id) {
        conditions.push(`p.category_id = $${valueIndex++}`);
        values.push(category_id);
    }
    // chọn nhiều type_id (?type_id=1&type_id=3&type_id=5) => req.query.type_id = ["1", "3", "5"]
    if (type_id) {
        let typeIds = [];

        if (Array.isArray(type_id)) {
            typeIds = type_id.map(Number); // ['1','3'] → [1,3]
        } else {
            typeIds = [Number(type_id)]; // "3" → [3]
        }

        // Tạo placeholders kiểu $3, $4, $5...
        const placeholders = typeIds.map(() => `$${valueIndex++}`).join(",");
        conditions.push(`p.type_id IN (${placeholders})`);
        typeIds.forEach(id => values.push(id));
    }
    // unaccent: bỏ dấu, ILIKE: k phân biệt hoa/thường
    if (ward) {
        conditions.push(`p.ward = $${valueIndex++}`);
        values.push(ward);
    }
    if (city) {
        conditions.push(`p.city = $${valueIndex++}`);
        values.push(city);
    }
    if (minPrice) {
        const priceField = "COALESCE(p.price, p.price_per_day, p.price_per_month)";
        conditions.push(`${priceField} >= $${valueIndex++}`);
        values.push(minPrice);
    }
    if (maxPrice) {
        const priceField = "COALESCE(p.price, p.price_per_day, p.price_per_month)";
        conditions.push(`${priceField} <= $${valueIndex++}`);
        values.push(maxPrice);
    }
    if (bedrooms) {
        if (Number(bedrooms) >= 5) {
            conditions.push(`p.bedrooms >= $${valueIndex++}`);
        } else {
            conditions.push(`p.bedrooms = $${valueIndex++}`);
        }
        values.push(bedrooms);
    }
    if (bathrooms) {
        if (Number(bathrooms) >= 5) {
            conditions.push(`p.bathrooms >= $${valueIndex++}`);
        } else {
            conditions.push(`p.bathrooms = $${valueIndex++}`);
        }
        values.push(bathrooms);
    }
    if (minSquare) {
        conditions.push(`p.area >= $${valueIndex++}`);
        values.push(minSquare);
    }
    if (maxSquare) {
        conditions.push(`p.area <= $${valueIndex++}`);
        values.push(maxSquare);
    }

    // Nối các điều kiện bằng AND
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        // Lấy tổng số bản ghi (phục vụ phân trang)
        const countResult = await pool.query(`SELECT COUNT(*) AS total FROM products p ${whereClause}`, values);
        const total = parseInt(countResult.rows[0].total);

        // Lấy danh sách sản phẩm + ảnh
        // COALESCE: nếu json_agg khác null -> return json_agg, nếu json_agg null -> return [].
        // json_build_object(key1, value1, key2, value2) -> tạo một object JSON như: { "id": 3, "image_url": "1.jpg" }
        // json_agg() -> gom tất cả các object này thành một mảng JSON cho mỗi sản phẩm.
        // FILTER (WHERE pi.id IS NOT NULL) giúp bỏ qua các dòng không có ảnh.
        // LEFT JOIN đảm bảo rằng: Sản phẩm không có ảnh vẫn xuất hiện trong kết quả.
        const productsResult = await pool.query(
            `
            SELECT p.*, 
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', pi.id, 'image_url', pi.image_url)) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images, 
            COALESCE(AVG(pr.rating)::float, 0) AS avg_rating 
            FROM products p 
            LEFT JOIN product_images pi ON p.id = pi.product_id 
            LEFT JOIN product_reviews pr ON p.id = pr.product_id 
            ${whereClause} GROUP BY p.id ORDER BY ${orderBy} 
            LIMIT ${limit} OFFSET ${offset}
            `, values
        );

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: productsResult.rows
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Không thể lấy được dữ liệu.' });
    }
};

// Lấy danh sách sản phẩm theo tìm kiếm.
export async function getProductsBySearch(req, res) {
    try {
        let { q = "", page = 1, limit = 12 } = req.query;

        page = Math.max(Number(page) || 1, 1);
        limit = Math.min(Number(limit) || 12, 24);
        const offset = (page - 1) * limit;

        const qKeywords = normalizeKeywords(q);
        const qCode = normalizeCode(q);

        const categories = await loadCategories(pool);
        const types = await loadTypes(pool);

        let category_id = null;
        let type_id = null;
        let city = null;
        let ward = null;

        for (const kw of qKeywords) {
            if (!category_id) {
                for (const c of categories) {
                    if (normalizeKeywords(c.name).includes(kw)) {
                        category_id = c.id;
                        break;
                    }
                }
            }
            if (!type_id) {
                for (const t of types) {
                    if (category_id && t.category_id !== category_id) continue; // type KHÔNG thuộc category đã chọn → bỏ qua
                    if (normalizeKeywords(t.name).includes(kw)) {
                        type_id = t.id;
                        break;
                    }
                }
            }
            if (category_id && type_id) break;
        }

        // Tìm ward trước
        for (const c of cityData) {
            for (const w of c.wards) {
                const wardWords = w.short_codename.split("_"); // ["thanh","xuan"]
                const isMatch = wardWords.every(word => qKeywords.includes(word));

                if (!ward && isMatch && qCode.includes(w.short_codename)) {
                    ward = w.code;
                    city = c.code; // suy ra city
                    break;
                }
            }
            if (ward) break;
        }

        // Nếu chưa có ward → tìm city
        if (!ward) {
            for (const c of cityData) {
                const cityWords = c.codename.split("_"); // ["ha","noi"]
                const isMatch = cityWords.every(word => qKeywords.includes(word));

                if (!city && isMatch && qCode.includes(c.codename)) {
                    city = c.code;
                    break;
                }
            }
        }

        let where = [];
        let values = [];
        let idx = 1;

        if (category_id) {
            where.push(`p.category_id = $${idx++}`);
            values.push(category_id);
        }
        if (type_id) {
            where.push(`p.type_id = $${idx++}`);
            values.push(type_id);
        }
        if (city) {
            where.push(`p.city = $${idx++}`);
            values.push(city);
        }
        if (ward) {
            where.push(`p.ward = $${idx++}`);
            values.push(ward);
        }
        if (!category_id && !type_id && !city && !ward) {
            where.push(`(
                unaccent(p.title) ILIKE unaccent($${idx}) OR
                unaccent(p.description) ILIKE unaccent($${idx}) OR
                unaccent(p.address) ILIKE unaccent($${idx})
            )`);
            values.push(`%${q}%`);
            idx++;
        }

        const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // Lấy tổng số bản ghi (phục vụ phân trang)
        const countResult = await pool.query(`SELECT COUNT(*) AS total FROM products p ${whereSQL}`, values);
        const total = parseInt(countResult.rows[0].total);

        const sql = `SELECT p.* FROM products p ${whereSQL} LIMIT $${idx} OFFSET $${idx + 1}`;
        values.push(limit, offset);

        const result = await pool.query(sql, values);

        res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            parsed: {
                category_id,
                type_id,
                city,
                ward,
            },
            data: result.rows
        });
    } catch (err) {
        console.error("SEARCH_ERROR:", err);
        res.status(500).json({ message: "Không thể lấy được dữ liệu." });
    }
};

// Lấy danh sách sản phẩm theo danh sách thành phố (ai cũng xem được).
export async function getCountByListCities(req, res) {
    try {
        const { cities } = req.query;
        if (!cities) return res.json([]);
    
        const cityIds = cities.split(",").map(s => s.trim()).filter(Boolean).map(Number);
        const placeholders = cityIds.map((_, i) => `$${i + 1}`).join(",");
    
        const result = await pool.query(
            `SELECT city, COUNT(*)::int AS total FROM products WHERE city IN (${placeholders}) GROUP BY city`,
            cityIds
        );
    
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không thể lấy dữ liệu." });
    }
};

// Lấy chi tiết sản phẩm theo id (ai cũng xem được).
export async function getProductById(req, res) {
    const productId = parseInt(req.params.id);

    try {
        const result = await pool.query(
            `
            SELECT p.*, 
            json_build_object('name', u.name, 'email', u.email, 'phone', u.phone, 'avatar', u.avatar) AS owner, 
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', pi.id, 'image_url', pi.image_url)) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images, 
            COALESCE(AVG(pr.rating)::float, 0) AS avg_rating 
            FROM products p 
            LEFT JOIN users u ON p.user_id = u.id 
            LEFT JOIN product_images pi ON p.id = pi.product_id 
            LEFT JOIN product_reviews pr ON p.id = pr.product_id 
            WHERE p.id = $1 
            GROUP BY p.id, u.id 
            LIMIT 1
            `, [productId]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể lấy được dữ liệu.' });
    }
}

// Lấy danh sách sản phẩm đã tạo
export async function getProductByUserId(req, res) {
    const userId = parseInt(req.user.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    try {
        const countResult = await pool.query('SELECT COUNT(*) AS total FROM products WHERE user_id=$1', [userId]);
        const total = parseInt(countResult.rows[0].total);

        const result = await pool.query(
            `
            SELECT p.*, 
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', pi.id, 'image_url', pi.image_url)) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images, 
            COALESCE(AVG(pr.rating)::float, 0) AS avg_rating 
            FROM products p 
            LEFT JOIN product_images pi ON p.id = pi.product_id 
            LEFT JOIN product_reviews pr ON p.id = pr.product_id 
            WHERE p.user_id = $1 GROUP BY p.id ORDER BY p.id DESC 
            LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return res.json({
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            data: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể lấy được dữ liệu.' });
    }
}

// Cập nhật sản phẩm (người tạo hoặc admin)
export async function updateProduct(req, res) {
    const productId = parseInt(req.params.id);
    const { title, description, category_id, type_id, rental_type, price, price_per_day, price_per_month, address, ward, city, latitude, longitude, area, bedrooms, bathrooms } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    try {
        // Kiểm tra sản phẩm, quyền truy cập
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });
        if (product.rows[0].user_id !== userId && !isAdmin) return res.status(403).json({ error: "Bạn không có quyền đối với sản phẩm này." });

        // Cập nhật thông tin sản phẩm
        const updatedProduct = await pool.query(
            `UPDATE products 
            SET title=$1, description=$2, category_id=$3, type_id=$4, rental_type=$5, price=$6, price_per_day=$7, price_per_month=$8, 
            address=$9, ward=$10, city=$11, latitude=$12, longitude=$13, area=$14, bedrooms=$15, bathrooms=$16 
            WHERE id=$17 RETURNING *
            `,
            [
                title, description, category_id, type_id, rental_type, price, price_per_day, price_per_month,
                address, ward, city, latitude, longitude, area, bedrooms, bathrooms, productId
            ]
        );

        res.json({
            message: 'Cập nhật sản phẩm thành công.',
            product: updatedProduct.rows[0],
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Cập nhật sản phẩm thất bại.' });
    }
};

// Xóa sản phẩm (người tạo hoặc admin)
export async function deleteProduct(req, res) {
    const productId = parseInt(req.params.id);
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Kiểm tra sản phẩm, quyền truy cập
        const product = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });
        if (product.rows[0].user_id !== userId && !isAdmin) return res.status(403).json({ error: "You don't have permission to delete this product." });

        // Lấy danh sách ảnh để xóa file
        const images = await client.query('SELECT image_url FROM product_images WHERE product_id = $1', [productId]);

        // // Nếu có images cũ → xóa trong bucket
        if (images.rows.length > 0) {
            const paths = images.rows.map(i => i.image_url.split('/products/')[1]);
            await supabase.storage.from('products').remove(paths);
        }

        // Xóa sản phẩm (sẽ tự động xóa bản ghi ảnh trong DB)
        await client.query('DELETE FROM products WHERE id = $1', [productId]);
        await client.query('COMMIT');
        res.json({ message: 'Xóa sản phẩm thành công.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).json({ error: 'Xóa sản phẩm thất bại.' });
    } finally {
        client.release();
    }
};

// Xóa ảnh riêng lẻ
export async function deleteProductImage(req, res) {
    const { productId, imageId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    try {
        // Kiểm tra sản phẩm, quyền truy cập
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) return res.status(404).json({ error: 'Sản phẩm không tồn tại.' });
        if (product.rows[0].user_id !== userId && !isAdmin) return res.status(403).json({ error: "Bạn không có quyền đối với sản phẩm này." });

        // Lấy images hiện tại từ DB
        const images = await pool.query('SELECT image_url FROM product_images WHERE id = $1 AND product_id = $2', [imageId, productId]);
        if (images.rows.length === 0) return res.status(404).json({ error: 'Hình ảnh không tồn tại.' });

        // // Nếu có images cũ → xóa trong bucket
        if (images.rows.length > 0) {
            // image_url: https://storage/v1/object/public/products/1760670339006_apartment.jpg
            const filePath = images.rows[0].image_url.split('/products/')[1]; // 1760670339006_apartment.jpg
            await supabase.storage.from('products').remove([filePath]);
        }

        // Xóa bản ghi DB
        await pool.query('DELETE FROM product_images WHERE id = $1', [imageId]);

        res.json({ message: 'Xóa hình ảnh thành công.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Xóa hình ảnh không thành công.' });
    }
};
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Khởi tạo Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Multer memoryStorage (không ghi file vào disk)
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
    const allowed = /jpeg|jpg|png/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (allowed.test(ext) && allowed.test(mime)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ cho phép file ảnh (jpeg, jpg, png)'));
    }
}

// upload cho avatar
const uploadAvatar = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB/ảnh
    fileFilter
});

// upload cho type
const uploadType = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB/ảnh
    fileFilter
});

// upload cho product
const uploadProduct = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB/ảnh
    fileFilter
});


// Hàm upload file lên supabase
async function uploadToSupabase(bucket, file) {
    const fileName = `${Date.now()}_${file.originalname}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: true
        });

    if (error) throw error;

    const { data: publicUrl } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

    return publicUrl.publicUrl;
}

module.exports = { uploadAvatar, uploadType, uploadProduct, uploadToSupabase, supabase };
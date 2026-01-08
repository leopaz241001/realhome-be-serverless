import { createClient } from "@supabase/supabase-js";

// Khởi tạo Supabase client
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Hàm upload file lên supabase
export async function uploadToSupabase(bucket, file) {
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
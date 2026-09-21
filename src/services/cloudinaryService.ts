import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Cloudinary will auto-read CLOUDINARY_URL from process.env
cloudinary.config();

export interface UploadVideoResult {
  videoUrl: string;
  thumbnailUrl: string;
  durationMs: number;
}

export interface UploadImageResult {
  imageUrl: string;
}

/**
 * Uploads a video to Cloudinary, extracts poster thumbnail, deletes local temp file,
 * and returns CDN URLs.
 */
export const uploadVideoToCloudinary = async (filePath: string): Promise<UploadVideoResult> => {
  try {
    const result = await cloudinary.uploader.upload_large(filePath, {
      resource_type: 'video',
      folder: 'toj_reels',
      chunk_size: 6000000,
    });

    const resAny = result as any;
    const videoUrl = resAny.secure_url;
    // In Cloudinary, any video's first frame thumbnail can be directly retrieved by changing format to .jpg
    const thumbnailUrl = resAny.secure_url.replace(/\.[^/.]+$/, '.jpg');

    const durationMs = Math.round((resAny.duration || 15) * 1000);

    // Delete temporary file from local disk so zero bytes stay on server
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanErr) {
      console.warn('Failed to delete temp video file:', cleanErr);
    }

    return {
      videoUrl,
      thumbnailUrl,
      durationMs
    };
  } catch (err) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {}
    throw err;
  }
};

/**
 * Uploads an image (e.g. avatar, thumbnail) to Cloudinary and deletes local temp file.
 */
export const uploadImageToCloudinary = async (filePath: string, folder: string = 'toj_avatars'): Promise<UploadImageResult> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'image',
      folder: folder
    });

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanErr) {
      console.warn('Failed to delete temp image file:', cleanErr);
    }

    return {
      imageUrl: result.secure_url
    };
  } catch (err) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {}
    throw err;
  }
};

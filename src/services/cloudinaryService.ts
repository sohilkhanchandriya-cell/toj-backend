import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

// Configure Cloudinary with environment URL or direct credentials
if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
} else {
  cloudinary.config({
    cloud_name: 'ljaokyki',
    api_key: '979135217165443',
    api_secret: 'A8XocuPVL5bzgUeqNAnOIKiPo1Q',
    secure: true,
  });
}

export interface UploadVideoResult {
  videoUrl: string;
  thumbnailUrl: string;
  durationMs: number;
}

export interface UploadImageResult {
  imageUrl: string;
}

/**
 * Uploads a video to Cloudinary, extracts poster thumbnail, deletes local temp file on success,
 * and returns CDN URLs. If upload fails, local file is kept for server fallback.
 */
export const uploadVideoToCloudinary = async (filePath: string): Promise<UploadVideoResult> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'toj_reels',
    });

    const resAny = result as any;
    const videoUrl = resAny?.secure_url || resAny?.url || '';
    const thumbnailUrl = videoUrl ? videoUrl.replace(/\.[^/.]+$/, '.jpg') : '';
    const durationMs = Math.round((resAny?.duration || 15) * 1000);

    // Only delete local temp file when Cloudinary upload succeeds
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}

    return {
      videoUrl,
      thumbnailUrl,
      durationMs,
    };
  } catch (err) {
    // Preserve local file on error so server fallback can serve it
    console.error('Cloudinary video upload failed:', err);
    throw err;
  }
};

/**
 * Uploads an image (e.g. avatar, thumbnail) to Cloudinary and deletes local temp file on success.
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
    console.error('Cloudinary image upload failed:', err);
    throw err;
  }
};

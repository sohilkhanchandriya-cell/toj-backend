import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const createDirIfNotExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let destFolder = 'uploads/reels';

    if (file.fieldname === 'avatar') {
      destFolder = 'uploads/avatars';
    } else if (file.fieldname === 'thumbnail' || file.fieldname === 'cover') {
      destFolder = 'uploads/thumbnails';
    } else if (file.fieldname === 'sound' || file.fieldname === 'audio') {
      destFolder = 'uploads/sounds';
    }

    createDirIfNotExists(destFolder);
    cb(null, destFolder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'video') {
    const allowedVideoExts = ['.mp4', '.mov', '.webm', '.mkv', '.3gp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedVideoExts.includes(ext) || file.mimetype.startsWith('video/')) {
      return cb(null, true);
    }
    return cb(new Error('Invalid video format. Supported: MP4, MOV, WEBM, MKV, 3GP'));
  }

  if (file.fieldname === 'avatar' || file.fieldname === 'thumbnail' || file.fieldname === 'cover') {
    const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedImageExts.includes(ext) || file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('Invalid image format. Supported: JPG, PNG, WEBP'));
  }

  cb(null, true);
};

export const uploadMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB max file size
  },
});

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import { uploadVideoToCloudinary, uploadImageToCloudinary } from '../services/cloudinaryService';

async function migrate() {
  console.log('--- Starting Migration to Cloudinary CDN ---');

  // 1. Migrate User Avatars
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users to check...`);

  for (const user of users) {
    if (user.profilePicUrl && user.profilePicUrl.includes('/uploads/avatars/')) {
      const filename = path.basename(user.profilePicUrl);
      const localPath = path.join(__dirname, '../../uploads/avatars', filename);
      if (fs.existsSync(localPath)) {
        console.log(`Uploading avatar for @${user.username}: ${filename}...`);
        try {
          const res = await uploadImageToCloudinary(localPath, 'toj_avatars');
          await prisma.user.update({
            where: { id: user.id },
            data: { profilePicUrl: res.imageUrl }
          });
          console.log(`Updated @${user.username} avatar: ${res.imageUrl}`);
        } catch (err) {
          console.error(`Failed to migrate avatar for @${user.username}:`, err);
        }
      }
    }
  }

  // 2. Migrate Reels & Thumbnails
  const reels = await prisma.reel.findMany();
  console.log(`Found ${reels.length} reels to migrate...`);

  for (const reel of reels) {
    let newVideoUrl = reel.videoUrl;
    let newThumbUrl = reel.thumbnailUrl;

    if (reel.videoUrl && reel.videoUrl.includes('/uploads/reels/')) {
      const videoFilename = path.basename(reel.videoUrl);
      const localVideoPath = path.join(__dirname, '../../uploads/reels', videoFilename);

      if (fs.existsSync(localVideoPath)) {
        console.log(`Uploading reel ${reel.id} (${videoFilename})...`);
        try {
          const res = await uploadVideoToCloudinary(localVideoPath);
          newVideoUrl = res.videoUrl;
          newThumbUrl = res.thumbnailUrl;
          console.log(`Reel ${reel.id} uploaded: ${newVideoUrl}`);
        } catch (err) {
          console.error(`Failed to upload video for reel ${reel.id}:`, err);
        }
      }
    }

    // Check if separate custom thumbnail exists
    if (reel.thumbnailUrl && reel.thumbnailUrl.includes('/uploads/thumbnails/')) {
      const thumbFilename = path.basename(reel.thumbnailUrl);
      const localThumbPath = path.join(__dirname, '../../uploads/thumbnails', thumbFilename);
      if (fs.existsSync(localThumbPath)) {
        try {
          const res = await uploadImageToCloudinary(localThumbPath, 'toj_thumbnails');
          newThumbUrl = res.imageUrl;
          console.log(`Thumbnail for reel ${reel.id} uploaded: ${newThumbUrl}`);
        } catch (err) {
          console.warn(`Thumbnail migration skipped for ${reel.id}:`, err);
        }
      }
    }

    if (newVideoUrl !== reel.videoUrl || newThumbUrl !== reel.thumbnailUrl) {
      await prisma.reel.update({
        where: { id: reel.id },
        data: {
          videoUrl: newVideoUrl,
          thumbnailUrl: newThumbUrl
        }
      });
      console.log(`Reel ${reel.id} database record updated.`);
    }
  }

  console.log('--- Migration to Cloudinary CDN Complete! ---');
}

migrate()
  .catch(err => {
    console.error('Migration fatal error:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });

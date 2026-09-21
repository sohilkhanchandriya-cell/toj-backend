import { Response } from 'express';
import path from 'path';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';
import { FeedService } from '../services/feedService';
import { generateThumbnailFromVideo } from '../utils/thumbnailGenerator';
import { uploadVideoToCloudinary, uploadImageToCloudinary } from '../services/cloudinaryService';
import fs from 'fs';

export class ReelsController {
  /**
   * Get Feed (For You / Following)
   */
  static async getFeed(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const viewerId = req.user?.id;
      const type = (req.query.type as string) || 'foryou';
      const cursor = req.query.cursor as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;

      if (type === 'following') {
        if (!viewerId) {
          res.status(401).json({ success: false, message: 'Authentication required for Following feed' });
          return;
        }
        const feed = await FeedService.getFollowingFeed(viewerId, cursor, limit);
        res.status(200).json({ success: true, ...feed });
        return;
      }

      // Default: For You algorithmic feed
      const feed = await FeedService.getForYouFeed(viewerId, cursor, limit);
      res.status(200).json({ success: true, ...feed });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single Reel by ID
   */
  static async getReelById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const viewerId = req.user?.id;

      const reel = await prisma.reel.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profilePicUrl: true,
              isVerified: true,
            },
          },
          sound: true,
          hashtags: {
            include: { hashtag: true },
          },
        },
      });

      if (!reel) {
        res.status(404).json({ success: false, message: 'Reel not found' });
        return;
      }

      const [hydrated] = await FeedService.hydrateReelsWithViewerState([reel], viewerId);
      res.status(200).json({ success: true, reel: hydrated });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload Reel (video + optional thumbnail)
   */
  static async uploadReel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const videoFile = files?.['video']?.[0];
      const thumbnailFile = files?.['thumbnail']?.[0] || files?.['cover']?.[0];

      if (!videoFile) {
        res.status(400).json({ success: false, message: 'Video file is required' });
        return;
      }

      let videoUrl = '';
      let thumbnailUrl = '';
      let actualDurationMs = req.body.durationMs ? parseInt(req.body.durationMs) : 15000;

      const host = req.get('host') || 'localhost:5000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;

      if (process.env.CLOUDINARY_URL) {
        try {
          console.log('Attempting reel video upload to Cloudinary CDN...');
          const cloudVideo = await uploadVideoToCloudinary(videoFile.path);
          if (cloudVideo && cloudVideo.videoUrl) {
            videoUrl = cloudVideo.videoUrl;
            thumbnailUrl = cloudVideo.thumbnailUrl;
            if (cloudVideo.durationMs) {
              actualDurationMs = cloudVideo.durationMs;
            }
            console.log('Cloudinary video upload successful:', videoUrl);
          }

          if (thumbnailFile && fs.existsSync(thumbnailFile.path)) {
            try {
              const customThumb = await uploadImageToCloudinary(thumbnailFile.path, 'toj_thumbnails');
              thumbnailUrl = customThumb.imageUrl;
            } catch (thumbErr) {
              console.warn('Custom thumbnail upload to Cloudinary failed, using auto-generated:', thumbErr);
            }
          }
        } catch (cloudErr) {
          console.warn('Cloudinary upload timed out or failed, falling back to direct server storage:', cloudErr);
        }
      }

      // Fallback: If Cloudinary was not used or encountered a network timeout
      if (!videoUrl) {
        videoUrl = `${baseUrl}/uploads/reels/${videoFile.filename}`;
        let thumbnailFilename = thumbnailFile?.filename;
        if (!thumbnailFilename) {
          try {
            const generatedName = `${path.parse(videoFile.filename).name}.jpg`;
            thumbnailFilename = await generateThumbnailFromVideo(videoFile.path, generatedName);
          } catch (err) {
            console.error('Thumbnail generation error:', err);
            thumbnailFilename = 'default_thumb.jpg';
          }
        }
        thumbnailUrl = `${baseUrl}/uploads/thumbnails/${thumbnailFilename}`;
      }

      const { caption, soundId, privacy, commentsEnabled, durationMs } = req.body;

      // Extract hashtags from caption or explicit hashtags string
      const rawTags: string[] = [];
      if (caption) {
        const matches = caption.match(/#[a-zA-Z0-9_]+/g);
        if (matches) {
          rawTags.push(...matches.map((m: string) => m.replace('#', '').toLowerCase()));
        }
      }
      if (req.body.hashtags) {
        try {
          const parsed = typeof req.body.hashtags === 'string' ? JSON.parse(req.body.hashtags) : req.body.hashtags;
          if (Array.isArray(parsed)) rawTags.push(...parsed);
        } catch {
          rawTags.push(...req.body.hashtags.split(',').map((s: string) => s.trim().toLowerCase()));
        }
      }

      const uniqueTags = Array.from(new Set(rawTags.filter((t) => t.length > 0)));

      // Create reel
      const reel = await prisma.reel.create({
        data: {
          userId,
          videoUrl,
          thumbnailUrl,
          caption: caption || '',
          soundId: soundId || null,
          privacy: privacy || 'public',
          commentsEnabled: commentsEnabled !== undefined ? String(commentsEnabled) === 'true' : true,
          durationMs: actualDurationMs,
          status: 'live',
        },
      });

      // Link hashtags & update counters
      for (const tag of uniqueTags) {
        const hashtag = await prisma.hashtag.upsert({
          where: { tag },
          update: { usageCount: { increment: 1 } },
          create: { tag, usageCount: 1 },
        });

        await prisma.reelHashtag.create({
          data: {
            reelId: reel.id,
            hashtagId: hashtag.id,
          },
        });
      }

      // If sound was selected, increment usage count
      if (soundId) {
        await prisma.sound.update({
          where: { id: soundId },
          data: { usageCount: { increment: 1 } },
        }).catch(() => {});
      }

      const fullReel = await prisma.reel.findUnique({
        where: { id: reel.id },
        include: {
          user: true,
          sound: true,
          hashtags: { include: { hashtag: true } },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Reel published successfully',
        reel: fullReel,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Record a view on a reel
   */
  static async recordView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const viewerId = req.user?.id;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

      if (viewerId) {
        const existingView = await prisma.reelView.findUnique({
          where: {
            userId_reelId: {
              userId: viewerId,
              reelId: id,
            },
          },
        });

        if (existingView) {
          const currentReel = await prisma.reel.findUnique({
            where: { id },
            select: { id: true, viewCount: true },
          });
          res.status(200).json({ success: true, viewCount: currentReel?.viewCount || 0, alreadyViewed: true });
          return;
        }

        await prisma.reelView.create({
          data: {
            userId: viewerId,
            reelId: id,
            ipAddress,
          },
        });
      }

      const reel = await prisma.reel.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
        select: { id: true, viewCount: true },
      });

      res.status(200).json({ success: true, viewCount: reel.viewCount });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete Reel
   */
  static async deleteReel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const reel = await prisma.reel.findUnique({ where: { id } });
      if (!reel) {
        res.status(404).json({ success: false, message: 'Reel not found' });
        return;
      }

      if (reel.userId !== userId) {
        res.status(403).json({ success: false, message: 'You can only delete your own reels' });
        return;
      }

      await prisma.reel.delete({ where: { id } });
      res.status(200).json({ success: true, message: 'Reel deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get reels by hashtag
   */
  static async getReelsByHashtag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tag } = req.params;
      const cleanTag = tag.toLowerCase().replace('#', '');
      const viewerId = req.user?.id;

      const hashtag = await prisma.hashtag.findUnique({
        where: { tag: cleanTag },
      });

      if (!hashtag) {
        res.status(200).json({ success: true, hashtag: { tag: cleanTag, usageCount: 0 }, reels: [] });
        return;
      }

      const relations = await prisma.reelHashtag.findMany({
        where: { hashtagId: hashtag.id, reel: { status: 'live', privacy: 'public' } },
        include: {
          reel: {
            include: {
              user: true,
              sound: true,
              hashtags: { include: { hashtag: true } },
            },
          },
        },
        take: 30,
        orderBy: { reel: { createdAt: 'desc' } },
      });

      const reels = relations.map((r) => r.reel);
      const hydrated = await FeedService.hydrateReelsWithViewerState(reels, viewerId);

      res.status(200).json({
        success: true,
        hashtag,
        reels: hydrated,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get reels by sound ID
   */
  static async getReelsBySound(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const viewerId = req.user?.id;

      const sound = await prisma.sound.findUnique({ where: { id } });
      if (!sound) {
        res.status(404).json({ success: false, message: 'Sound not found' });
        return;
      }

      const reels = await prisma.reel.findMany({
        where: { soundId: id, status: 'live', privacy: 'public' },
        include: {
          user: true,
          sound: true,
          hashtags: { include: { hashtag: true } },
        },
        take: 30,
        orderBy: { createdAt: 'desc' },
      });

      const hydrated = await FeedService.hydrateReelsWithViewerState(reels, viewerId);

      res.status(200).json({
        success: true,
        sound,
        reels: hydrated,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

import { Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import { FeedService } from '../services/feedService';

export class UserController {
  /**
   * Get current authenticated user profile + statistics
   */
  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const [user, userReels, postsCount, followersCount, followingCount, likesTotal] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.reel.findMany({
          where: { userId, status: 'live' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            userId: true,
            videoUrl: true,
            thumbnailUrl: true,
            caption: true,
            durationMs: true,
            privacy: true,
            commentsEnabled: true,
            viewCount: true,
            likeCount: true,
            commentCount: true,
            shareCount: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                profilePicUrl: true,
                isVerified: true,
              },
            },
          },
        }),
        prisma.reel.count({ where: { userId, status: 'live' } }),
        prisma.follow.count({ where: { followingId: userId, status: 'accepted' } }),
        prisma.follow.count({ where: { followerId: userId, status: 'accepted' } }),
        prisma.like.count({ where: { reel: { userId } } }),
      ]);

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const hydratedReels = await FeedService.hydrateReelsWithViewerState(userReels as any, userId);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
          bio: user.bio,
          profilePicUrl: user.profilePicUrl,
          isPrivate: user.isPrivate,
          isVerified: user.isVerified,
          category: user.category,
          createdAt: user.createdAt,
        },
        stats: {
          postsCount,
          followersCount,
          followingCount,
          likesCount: likesTotal,
        },
        isSelf: true,
        reels: hydratedReels,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update profile fields (bio, displayName, category, isPrivate)
   */
  static async updateMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { bio, displayName, category, isPrivate } = req.body;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(bio !== undefined ? { bio: bio.slice(0, 150) } : {}),
          ...(displayName ? { displayName } : {}),
          ...(category ? { category } : {}),
          ...(isPrivate !== undefined ? { isPrivate: isPrivate === true || isPrivate === 'true' } : {}),
        },
      });

      res.status(200).json({
        success: true,
        user: {
          id: updated.id,
          username: updated.username,
          displayName: updated.displayName,
          bio: updated.bio,
          profilePicUrl: updated.profilePicUrl,
          category: updated.category,
          isPrivate: updated.isPrivate,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update username with uniqueness check
   */
  static async updateUsername(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { username } = req.body;

      if (!username) {
        res.status(400).json({ success: false, message: 'Username is required' });
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({
          success: false,
          message: 'Username must be 3-20 characters, alphanumeric and underscore only',
        });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== userId) {
        res.status(400).json({ success: false, message: 'Username is already taken' });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { username },
      });

      res.status(200).json({
        success: true,
        message: 'Username updated successfully',
        username: updated.username,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload / change profile picture
   */
  static async uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No image uploaded' });
        return;
      }

      let profilePicUrl: string;
      if (process.env.CLOUDINARY_URL) {
        const cloudImg = await uploadImageToCloudinary(req.file.path, 'toj_avatars');
        profilePicUrl = cloudImg.imageUrl;
      } else {
        const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        profilePicUrl = `${baseUrl}/uploads/avatars/${req.file.filename}`;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { profilePicUrl },
      });

      res.status(200).json({
        success: true,
        profilePicUrl,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get public profile by username
   */
  static async getProfileByUsername(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { username } = req.params;
      const viewerId = req.user?.id;

      const user = await prisma.user.findUnique({
        where: { username },
        include: {
          reels: {
            where: { status: 'live', privacy: 'public' },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: {
              id: true,
              userId: true,
              videoUrl: true,
              thumbnailUrl: true,
              caption: true,
              durationMs: true,
              privacy: true,
              commentsEnabled: true,
              viewCount: true,
              likeCount: true,
              commentCount: true,
              shareCount: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  profilePicUrl: true,
                  isVerified: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const [followersCount, followingCount, totalLikes] = await Promise.all([
        prisma.follow.count({ where: { followingId: user.id, status: 'accepted' } }),
        prisma.follow.count({ where: { followerId: user.id, status: 'accepted' } }),
        prisma.like.count({ where: { reel: { userId: user.id } } }),
      ]);

      // Check if viewer follows user or has pending request
      let followStatus: 'none' | 'following' | 'pending' = 'none';
      if (viewerId && viewerId !== user.id) {
        const followEdge = await prisma.follow.findUnique({
          where: {
            followerId_followingId: { followerId: viewerId, followingId: user.id },
          },
        });
        if (followEdge) {
          followStatus = followEdge.status === 'accepted' ? 'following' : 'pending';
        }
      }

      const hydratedReels = await FeedService.hydrateReelsWithViewerState(user.reels as any, viewerId);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          profilePicUrl: user.profilePicUrl,
          isVerified: user.isVerified,
          isPrivate: user.isPrivate,
          category: user.category,
        },
        stats: {
          postsCount: user.reels.length,
          followersCount,
          followingCount,
          likesCount: totalLikes,
        },
        followStatus,
        isSelf: viewerId === user.id,
        reels: hydratedReels,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

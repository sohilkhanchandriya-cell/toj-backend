import { Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';
import { FeedService } from '../services/feedService';

export class SearchController {
  /**
   * Search users by username or displayName
   */
  static async searchUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const q = (req.query.q as string) || '';
      const viewerId = req.user?.id;

      if (!q.trim()) {
        res.status(200).json({ success: true, users: [] });
        return;
      }

      const users = await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: q } },
            { displayName: { contains: q } },
          ],
          status: 'active',
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          profilePicUrl: true,
          bio: true,
          isVerified: true,
          _count: { select: { followers: true } },
        },
        take: 20,
      });

      let followingSet = new Set<string>();
      if (viewerId) {
        const follows = await prisma.follow.findMany({
          where: { followerId: viewerId, status: 'accepted' },
          select: { followingId: true },
        });
        followingSet = new Set(follows.map((f) => f.followingId));
      }

      const results = users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        profilePicUrl: u.profilePicUrl,
        bio: u.bio,
        isVerified: u.isVerified,
        followersCount: u._count.followers,
        isFollowing: followingSet.has(u.id),
      }));

      res.status(200).json({ success: true, users: results });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Search hashtags
   */
  static async searchHashtags(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const q = ((req.query.q as string) || '').toLowerCase().replace('#', '');

      if (!q.trim()) {
        res.status(200).json({ success: true, hashtags: [] });
        return;
      }

      const hashtags = await prisma.hashtag.findMany({
        where: { tag: { contains: q } },
        orderBy: { usageCount: 'desc' },
        take: 20,
      });

      res.status(200).json({ success: true, hashtags });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Search sounds
   */
  static async searchSounds(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const q = (req.query.q as string) || '';

      const sounds = await prisma.sound.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { artist: { contains: q } },
          ],
        },
        orderBy: { usageCount: 'desc' },
        take: 20,
      });

      res.status(200).json({ success: true, sounds });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Explore grid with trending reels, hashtags, and sounds
   */
  static async getExplore(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const viewerId = req.user?.id;

      const [reels, trendingHashtags, trendingSounds] = await Promise.all([
        prisma.reel.findMany({
          where: { status: 'live', privacy: 'public' },
          orderBy: [{ likeCount: 'desc' }, { viewCount: 'desc' }],
          take: 30,
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
            hashtags: { include: { hashtag: true } },
          },
        }),
        prisma.hashtag.findMany({
          orderBy: { usageCount: 'desc' },
          take: 10,
        }),
        prisma.sound.findMany({
          orderBy: { usageCount: 'desc' },
          take: 10,
        }),
      ]);

      const hydrated = await FeedService.hydrateReelsWithViewerState(reels, viewerId);

      res.status(200).json({
        success: true,
        trendingReels: hydrated,
        trendingHashtags,
        trendingSounds,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

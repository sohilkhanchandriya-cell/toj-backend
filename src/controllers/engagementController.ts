import { Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';
import { FeedService } from '../services/feedService';

export class EngagementController {
  /**
   * Like a reel
   */
  static async likeReel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id: reelId } = req.params;

      const reel = await prisma.reel.findUnique({ where: { id: reelId } });
      if (!reel) {
        res.status(404).json({ success: false, message: 'Reel not found' });
        return;
      }

      const existing = await prisma.like.findUnique({
        where: { userId_reelId: { userId, reelId } },
      });

      if (existing) {
        res.status(200).json({ success: true, message: 'Already liked', likeCount: reel.likeCount });
        return;
      }

      await prisma.$transaction([
        prisma.like.create({ data: { userId, reelId } }),
        prisma.reel.update({
          where: { id: reelId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      // Create notification if actor is not the creator
      if (reel.userId !== userId) {
        await prisma.notification.create({
          data: {
            recipientId: reel.userId,
            actorId: userId,
            type: 'like',
            reelId,
          },
        }).catch(() => {});
      }

      res.status(200).json({ success: true, isLiked: true, likeCount: reel.likeCount + 1 });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Unlike a reel
   */
  static async unlikeReel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id: reelId } = req.params;

      const reel = await prisma.reel.findUnique({ where: { id: reelId } });
      if (!reel) {
        res.status(404).json({ success: false, message: 'Reel not found' });
        return;
      }

      const existing = await prisma.like.findUnique({
        where: { userId_reelId: { userId, reelId } },
      });

      if (!existing) {
        res.status(200).json({ success: true, message: 'Not liked', likeCount: reel.likeCount });
        return;
      }

      await prisma.$transaction([
        prisma.like.delete({
          where: { userId_reelId: { userId, reelId } },
        }),
        prisma.reel.update({
          where: { id: reelId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      res.status(200).json({
        success: true,
        isLiked: false,
        likeCount: Math.max(reel.likeCount - 1, 0),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get comments on a reel (threaded with replies)
   */
  static async getComments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id: reelId } = req.params;

      const comments = await prisma.comment.findMany({
        where: { reelId, parentCommentId: null },
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
          replies: {
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
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({ success: true, comments });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Add a comment or reply
   */
  static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      let userId = req.user?.id;
      if (!userId) {
        let guestUser = await prisma.user.findFirst({ where: { username: 'toj_fan' } });
        if (!guestUser) {
          guestUser = await prisma.user.create({
            data: {
              username: 'toj_fan',
              displayName: 'TOJ Community Member',
              profilePicUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=toj_fan',
            }
          });
        }
        userId = guestUser.id;
      }

      const { id: reelId } = req.params;
      const { text, parentCommentId } = req.body;

      if (!text || !text.trim()) {
        res.status(400).json({ success: false, message: 'Comment text is required' });
        return;
      }

      const reel = await prisma.reel.findUnique({ where: { id: reelId } });
      if (!reel) {
        res.status(404).json({ success: false, message: 'Reel not found' });
        return;
      }

      if (!reel.commentsEnabled) {
        res.status(403).json({ success: false, message: 'Comments are disabled on this reel' });
        return;
      }

      const comment = await prisma.comment.create({
        data: {
          reelId,
          userId,
          parentCommentId: parentCommentId || null,
          text: text.trim(),
        },
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
        },
      });

      await prisma.reel.update({
        where: { id: reelId },
        data: { commentCount: { increment: 1 } },
      });

      // Send notification to reel creator or parent comment author
      const recipientId = parentCommentId ? (await prisma.comment.findUnique({ where: { id: parentCommentId } }))?.userId : reel.userId;
      if (recipientId && recipientId !== userId) {
        await prisma.notification.create({
          data: {
            recipientId,
            actorId: userId,
            type: 'comment',
            reelId,
            commentId: comment.id,
          },
        }).catch(() => {});
      }

      res.status(201).json({ success: true, comment: { ...comment, replies: [] } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete a comment
   */
  static async deleteComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const comment = await prisma.comment.findUnique({
        where: { id },
        include: { reel: true },
      });

      if (!comment) {
        res.status(404).json({ success: false, message: 'Comment not found' });
        return;
      }

      // Can be deleted by author of comment OR author of reel
      if (comment.userId !== userId && comment.reel.userId !== userId) {
        res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
        return;
      }

      await prisma.comment.delete({ where: { id } });
      await prisma.reel.update({
        where: { id: comment.reelId },
        data: { commentCount: { decrement: 1 } },
      });

      res.status(200).json({ success: true, message: 'Comment deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Save / Bookmark a reel
   */
  static async saveReel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id: reelId } = req.params;

      await prisma.savedReel.upsert({
        where: { userId_reelId: { userId, reelId } },
        update: {},
        create: { userId, reelId },
      });

      res.status(200).json({ success: true, isSaved: true, message: 'Reel saved to collection' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Unsave / Remove bookmark
   */
  static async unsaveReel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id: reelId } = req.params;

      await prisma.savedReel.deleteMany({
        where: { userId, reelId },
      });

      res.status(200).json({ success: true, isSaved: false, message: 'Reel removed from saved' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get all saved reels for current user
   */
  static async getSavedReels(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const saved = await prisma.savedReel.findMany({
        where: { userId },
        include: {
          reel: {
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
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const reels = saved.map((s) => s.reel);
      const hydrated = await FeedService.hydrateReelsWithViewerState(reels, userId);

      res.status(200).json({ success: true, reels: hydrated });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

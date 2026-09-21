import { Request, Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';

export class SettingsController {
  /**
   * Report a reel, comment, or user
   */
  static async reportContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const reporterId = req.user!.id;
      const { reportedUserId, reelId, commentId, reason, details } = req.body;

      if (!reason) {
        res.status(400).json({ success: false, message: 'Reason is required' });
        return;
      }

      const report = await prisma.report.create({
        data: {
          reporterId,
          reportedUserId: reportedUserId || null,
          reelId: reelId || null,
          commentId: commentId || null,
          reason,
          details: details || '',
          status: 'pending',
        },
      });

      res.status(201).json({
        success: true,
        message: 'Thank you for keeping our community safe. Your report has been submitted.',
        reportId: report.id,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Block a user
   */
  static async blockUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const blockerId = req.user!.id;
      const { targetUserId } = req.body;

      if (!targetUserId || blockerId === targetUserId) {
        res.status(400).json({ success: false, message: 'Invalid target user ID' });
        return;
      }

      await prisma.$transaction([
        prisma.block.upsert({
          where: { blockerId_blockedId: { blockerId, blockedId: targetUserId } },
          update: {},
          create: { blockerId, blockedId: targetUserId },
        }),
        // Remove follow edges in both directions
        prisma.follow.deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: targetUserId },
              { followerId: targetUserId, followingId: blockerId },
            ],
          },
        }),
      ]);

      res.status(200).json({ success: true, message: 'User blocked successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Unblock a user
   */
  static async unblockUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const blockerId = req.user!.id;
      const { targetUserId } = req.body;

      await prisma.block.deleteMany({
        where: { blockerId, blockedId: targetUserId },
      });

      res.status(200).json({ success: true, message: 'User unblocked successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get blocked users list
   */
  static async getBlockedUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const blockerId = req.user!.id;

      const blocks = await prisma.block.findMany({
        where: { blockerId },
        include: {
          blocked: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profilePicUrl: true,
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        blockedUsers: blocks.map((b) => b.blocked),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * App config and feature flags (maintenance mode, force-update)
   */
  static async getAppConfig(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      minVersion: '1.0.0',
      currentVersion: '1.0.0',
      maintenanceMode: false,
      features: {
        musicEnabled: true,
        dmPhase2: false,
        duetPhase2: false,
        maxReelDurationSec: 60,
      },
    });
  }

  /**
   * Community Guidelines & Policy
   */
  static async getGuidelines(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      guidelines: [
        'Respect all community members. Harassment, hate speech, and bullying are strictly prohibited.',
        'Post only authentic, original short videos or content you have rights to share.',
        'No nudity, violence, or dangerous activities.',
        'Users must be 13 years or older to maintain an account.',
      ],
      termsUrl: 'https://toj.app/terms',
      privacyUrl: 'https://toj.app/privacy',
    });
  }
}

import { Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';

export class NotificationController {
  /**
   * Get notifications for authenticated user
   */
  static async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const recipientId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 20;

      const notifications = await prisma.notification.findMany({
        where: { recipientId },
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profilePicUrl: true,
              isVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Check if current user is following the actor (useful for Follow-back suggestion cards)
      const actorIds = notifications.map((n) => n.actorId);
      const follows = await prisma.follow.findMany({
        where: { followerId: recipientId, followingId: { in: actorIds }, status: 'accepted' },
        select: { followingId: true },
      });
      const followingSet = new Set(follows.map((f) => f.followingId));

      const enriched = notifications.map((n) => ({
        id: n.id,
        type: n.type,
        actor: n.actor,
        reelId: n.reelId,
        commentId: n.commentId,
        isRead: n.isRead,
        createdAt: n.createdAt,
        isFollowingActor: followingSet.has(n.actorId),
      }));

      res.status(200).json({ success: true, notifications: enriched });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const recipientId = req.user!.id;

      await prisma.notification.updateMany({
        where: { id, recipientId },
        data: { isRead: true },
      });

      res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const recipientId = req.user!.id;

      await prisma.notification.updateMany({
        where: { recipientId, isRead: false },
        data: { isRead: true },
      });

      res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get unread notifications count
   */
  static async getUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const recipientId = req.user!.id;

      const unreadCount = await prisma.notification.count({
        where: { recipientId, isRead: false },
      });

      res.status(200).json({ success: true, unreadCount });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

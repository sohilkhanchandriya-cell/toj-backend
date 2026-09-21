import { Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';

export class FollowController {
  /**
   * Follow a user or send a follow request
   */
  static async followUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const followerId = req.user!.id;
      const { userId: followingId } = req.params;

      if (followerId === followingId) {
        res.status(400).json({ success: false, message: 'You cannot follow yourself' });
        return;
      }

      const targetUser = await prisma.user.findUnique({ where: { id: followingId } });
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      // Check if already following
      const existing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId, followingId },
        },
      });

      if (existing) {
        res.status(200).json({
          success: true,
          status: existing.status,
          message: 'Already following or request pending',
        });
        return;
      }

      const status = targetUser.isPrivate ? 'pending' : 'accepted';

      const follow = await prisma.follow.create({
        data: {
          followerId,
          followingId,
          status,
        },
      });

      // Check if target user was already following the actor (Follow-back scenario)
      const targetFollowsActor = await prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId: followingId, followingId: followerId },
        },
      });

      const notificationType = targetFollowsActor ? 'follow' : 'follow_back_suggestion';

      await prisma.notification.create({
        data: {
          recipientId: followingId,
          actorId: followerId,
          type: notificationType,
        },
      });

      res.status(201).json({
        success: true,
        status: follow.status,
        message: status === 'pending' ? 'Follow request sent' : 'Followed successfully',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Unfollow a user
   */
  static async unfollowUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const followerId = req.user!.id;
      const { userId: followingId } = req.params;

      await prisma.follow.deleteMany({
        where: { followerId, followingId },
      });

      res.status(200).json({ success: true, message: 'Unfollowed successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Accept pending follow request (for private accounts)
   */
  static async acceptFollow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const followingId = req.user!.id; // Current account owner
      const { userId: followerId } = req.params;

      const follow = await prisma.follow.updateMany({
        where: { followerId, followingId, status: 'pending' },
        data: { status: 'accepted' },
      });

      if (follow.count === 0) {
        res.status(404).json({ success: false, message: 'Follow request not found' });
        return;
      }

      // Notify the requester that their request was accepted
      await prisma.notification.create({
        data: {
          recipientId: followerId,
          actorId: followingId,
          type: 'follow',
        },
      });

      res.status(200).json({ success: true, message: 'Follow request accepted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Reject pending follow request
   */
  static async rejectFollow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const followingId = req.user!.id;
      const { userId: followerId } = req.params;

      await prisma.follow.deleteMany({
        where: { followerId, followingId, status: 'pending' },
      });

      res.status(200).json({ success: true, message: 'Follow request rejected' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get follow-back suggestions and recommended accounts
   */
  static async getSuggestions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const currentUserId = req.user!.id;

      // 1. Find who follows the current user, but current user does NOT follow back yet
      const followers = await prisma.follow.findMany({
        where: { followingId: currentUserId, status: 'accepted' },
        select: { followerId: true },
      });

      const currentFollowing = await prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      });

      const followingIdSet = new Set(currentFollowing.map((f) => f.followingId));

      // Candidates for "Follow Back"
      const followBackIds = followers
        .map((f) => f.followerId)
        .filter((id) => !followingIdSet.has(id));

      const followBackUsers = await prisma.user.findMany({
        where: { id: { in: followBackIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          profilePicUrl: true,
          bio: true,
          isVerified: true,
        },
        take: 10,
      });

      // 2. Discover trending / suggested creators
      const suggestedUsers = await prisma.user.findMany({
        where: {
          id: { notIn: [currentUserId, ...Array.from(followingIdSet), ...followBackIds] },
          status: 'active',
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          profilePicUrl: true,
          bio: true,
          isVerified: true,
        },
        take: 15,
        orderBy: { followers: { _count: 'desc' } },
      });

      res.status(200).json({
        success: true,
        followBackSuggestions: followBackUsers.map((u) => ({ ...u, reason: 'Follows you' })),
        discoverSuggestions: suggestedUsers.map((u) => ({ ...u, reason: 'Popular creator' })),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get followers of a user
   */
  static async getFollowers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id: targetUserId } = req.params;
      const viewerId = req.user?.id;

      const followers = await prisma.follow.findMany({
        where: { followingId: targetUserId, status: 'accepted' },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profilePicUrl: true,
              bio: true,
              isVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      let viewerFollowingSet = new Set<string>();
      if (viewerId) {
        const viewerFollowing = await prisma.follow.findMany({
          where: { followerId: viewerId, status: 'accepted' },
          select: { followingId: true },
        });
        viewerFollowingSet = new Set(viewerFollowing.map((f) => f.followingId));
      }

      const list = followers.map((f) => ({
        ...f.follower,
        isFollowing: viewerFollowingSet.has(f.follower.id),
      }));

      res.status(200).json({ success: true, followers: list });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get accounts followed by a user
   */
  static async getFollowing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id: targetUserId } = req.params;
      const viewerId = req.user?.id;

      const following = await prisma.follow.findMany({
        where: { followerId: targetUserId, status: 'accepted' },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profilePicUrl: true,
              bio: true,
              isVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      let viewerFollowingSet = new Set<string>();
      if (viewerId) {
        const viewerFollowing = await prisma.follow.findMany({
          where: { followerId: viewerId, status: 'accepted' },
          select: { followingId: true },
        });
        viewerFollowingSet = new Set(viewerFollowing.map((f) => f.followingId));
      }

      const list = following.map((f) => ({
        ...f.following,
        isFollowing: viewerFollowingSet.has(f.following.id),
      }));

      res.status(200).json({ success: true, following: list });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

import prisma from '../prisma';

export interface ReelWithDetails {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string | null;
  durationMs: number;
  privacy: string;
  commentsEnabled: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string;
    profilePicUrl: string | null;
    isVerified: boolean;
  };
  sound?: {
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
  } | null;
  hashtags: string[];
  isLiked?: boolean;
  isSaved?: boolean;
  isFollowing?: boolean;
  isOwnReel?: boolean;
}

export class FeedService {
  /**
   * Generates the "For You" algorithmic feed.
   */
  static async getForYouFeed(
    viewerId?: string,
    cursor?: string,
    limit: number = 10
  ): Promise<{ reels: ReelWithDetails[]; nextCursor: string | null }> {
    // 1. Fetch blocked user IDs if viewer is logged in
    let blockedUserIds: string[] = [];
    let followingUserIds: string[] = [];

    if (viewerId) {
      const [blocks, follows] = await Promise.all([
        prisma.block.findMany({
          where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
          select: { blockerId: true, blockedId: true },
        }),
        prisma.follow.findMany({
          where: { followerId: viewerId, status: 'accepted' },
          select: { followingId: true },
        }),
      ]);

      blockedUserIds = blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId));
      followingUserIds = follows.map((f) => f.followingId);
    }

    // 2. Fetch candidates from DB
    const reels = await prisma.reel.findMany({
      where: {
        status: 'live',
        privacy: 'public',
        userId: { notIn: blockedUserIds },
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      take: limit * 2, // Take larger batch to rank and score
      orderBy: { createdAt: 'desc' },
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
        sound: {
          select: {
            id: true,
            title: true,
            artist: true,
            audioUrl: true,
          },
        },
        hashtags: {
          include: {
            hashtag: true,
          },
        },
      },
    });

    // 3. Order strictly by recency (newest uploaded reels first, then older, then older)
    const sortedByRecency = [...reels].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const selected = sortedByRecency.slice(0, limit);

    // 4. Hydrate viewer-specific interaction flags
    const hydratedReels = await this.hydrateReelsWithViewerState(selected, viewerId);

    const nextCursor =
      reels.length >= limit && selected.length > 0
        ? selected[selected.length - 1].createdAt.toISOString()
        : null;

    return { reels: hydratedReels, nextCursor };
  }

  /**
   * Generates chronological "Following" feed from users the viewer follows.
   */
  static async getFollowingFeed(
    viewerId: string,
    cursor?: string,
    limit: number = 10
  ): Promise<{ reels: ReelWithDetails[]; nextCursor: string | null }> {
    const following = await prisma.follow.findMany({
      where: { followerId: viewerId, status: 'accepted' },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return { reels: [], nextCursor: null };
    }

    const reels = await prisma.reel.findMany({
      where: {
        userId: { in: followingIds },
        status: 'live',
        privacy: { in: ['public', 'followers'] },
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
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
        sound: {
          select: {
            id: true,
            title: true,
            artist: true,
            audioUrl: true,
          },
        },
        hashtags: {
          include: {
            hashtag: true,
          },
        },
      },
    });

    const hasMore = reels.length > limit;
    const items = hasMore ? reels.slice(0, limit) : reels;

    const hydratedReels = await this.hydrateReelsWithViewerState(items, viewerId);
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    return { reels: hydratedReels, nextCursor };
  }

  /**
   * Hydrates reels with interaction flags (isLiked, isSaved, isFollowing, isOwnReel)
   */
  static async hydrateReelsWithViewerState(reels: any[], viewerId?: string): Promise<ReelWithDetails[]> {
    if (!reels.length) return [];

    const reelIds = reels.map((r) => r.id);
    const creatorIds = Array.from(new Set(reels.map((r) => r.userId)));

    let likedSet = new Set<string>();
    let savedSet = new Set<string>();
    let followingSet = new Set<string>();

    if (viewerId) {
      const [likes, saves, follows] = await Promise.all([
        prisma.like.findMany({
          where: { userId: viewerId, reelId: { in: reelIds } },
          select: { reelId: true },
        }),
        prisma.savedReel.findMany({
          where: { userId: viewerId, reelId: { in: reelIds } },
          select: { reelId: true },
        }),
        prisma.follow.findMany({
          where: { followerId: viewerId, followingId: { in: creatorIds }, status: 'accepted' },
          select: { followingId: true },
        }),
      ]);

      likedSet = new Set(likes.map((l) => l.reelId));
      savedSet = new Set(saves.map((s) => s.reelId));
      followingSet = new Set(follows.map((f) => f.followingId));
    }

    return reels.map((reel) => ({
      id: reel.id,
      userId: reel.userId,
      videoUrl: reel.videoUrl,
      thumbnailUrl: reel.thumbnailUrl,
      caption: reel.caption,
      durationMs: reel.durationMs,
      privacy: reel.privacy,
      commentsEnabled: reel.commentsEnabled,
      viewCount: reel.viewCount,
      likeCount: reel.likeCount,
      commentCount: reel.commentCount,
      shareCount: reel.shareCount,
      createdAt: reel.createdAt,
      user: reel.user,
      sound: reel.sound,
      hashtags: reel.hashtags ? reel.hashtags.map((h: any) => h.hashtag.tag) : [],
      isLiked: likedSet.has(reel.id),
      isSaved: savedSet.has(reel.id),
      isFollowing: followingSet.has(reel.userId),
      isOwnReel: viewerId === reel.userId,
    }));
  }
}

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
    category?: string;
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
   * Prioritizes UNWATCHED reels first and boosts user's preferred categories & interactions.
   */
  static async getForYouFeed(
    viewerId?: string,
    cursor?: string,
    limit: number = 10
  ): Promise<{ reels: ReelWithDetails[]; nextCursor: string | null }> {
    // 1. Fetch blocked user IDs, follows, likes, and views if viewer is logged in
    let blockedUserIds: string[] = [];
    let followingUserIds: string[] = [];
    const viewedReelIds = new Set<string>();
    const categoryAffinity = new Map<string, number>();

    if (viewerId) {
      const [blocks, follows, views, likes, viewerUser] = await Promise.all([
        prisma.block.findMany({
          where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
          select: { blockerId: true, blockedId: true },
        }),
        prisma.follow.findMany({
          where: { followerId: viewerId, status: 'accepted' },
          select: { followingId: true, following: { select: { category: true } } },
        }),
        prisma.reelView.findMany({
          where: { userId: viewerId },
          select: { reelId: true },
        }),
        prisma.like.findMany({
          where: { userId: viewerId },
          select: {
            reel: {
              select: {
                user: { select: { category: true } },
                hashtags: { select: { hashtag: { select: { tag: true } } } },
              },
            },
          },
          take: 30,
        }),
        prisma.user.findUnique({
          where: { id: viewerId },
          select: { category: true },
        }),
      ]);

      blockedUserIds = blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId));
      followingUserIds = follows.map((f) => f.followingId);

      // Populate watched reel IDs set
      views.forEach((v) => viewedReelIds.add(v.reelId));

      // Build category affinity weights
      // 1. User's own registered category (e.g. Fitness, Dance, Tech, Fashion, Comedy)
      if (viewerUser?.category && viewerUser.category.toLowerCase() !== 'personal') {
        const cat = viewerUser.category.toLowerCase().trim();
        categoryAffinity.set(cat, (categoryAffinity.get(cat) || 0) + 12);
      }

      // 2. Categories from creators the user follows (+4 pts each)
      follows.forEach((f) => {
        const cat = (f.following?.category || '').toLowerCase().trim();
        if (cat && cat !== 'personal') {
          categoryAffinity.set(cat, (categoryAffinity.get(cat) || 0) + 4);
        }
      });

      // 3. Categories & hashtags from reels the user liked (+3 pts each)
      likes.forEach((l) => {
        const cat = (l.reel?.user?.category || '').toLowerCase().trim();
        if (cat && cat !== 'personal') {
          categoryAffinity.set(cat, (categoryAffinity.get(cat) || 0) + 3);
        }
        l.reel?.hashtags?.forEach((h) => {
          const tag = (h.hashtag?.tag || '').toLowerCase().trim();
          if (tag) {
            categoryAffinity.set(tag, (categoryAffinity.get(tag) || 0) + 2);
          }
        });
      });
    }

    // 2. Fetch candidates from DB (take broader pool to rank accurately)
    const reels = await prisma.reel.findMany({
      where: {
        status: 'live',
        privacy: 'public',
        userId: { notIn: blockedUserIds },
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      take: Math.max(50, limit * 4),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profilePicUrl: true,
            isVerified: true,
            category: true,
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

    // 3. Algorithmic Scoring & Ranking
    const scoredReels = reels.map((reel) => {
      let score = 0;
      const isWatched = viewedReelIds.has(reel.id);

      // A. Unwatched Priority (+1000 pts)
      // Unwatched reels are prioritized heavily so unseen content appears first!
      if (!isWatched) {
        score += 1000;
      }

      // B. Category Affinity Match
      const creatorCategory = (reel.user.category || '').toLowerCase().trim();
      if (creatorCategory && categoryAffinity.has(creatorCategory)) {
        score += (categoryAffinity.get(creatorCategory) || 0) * 15;
      }

      // Hashtag & Keyword Match
      for (const rh of reel.hashtags) {
        const tag = (rh.hashtag?.tag || '').toLowerCase().trim();
        if (tag && categoryAffinity.has(tag)) {
          score += (categoryAffinity.get(tag) || 0) * 10;
        }
      }

      // Caption relevance to user's interested categories
      const captionLower = (reel.caption || '').toLowerCase();
      categoryAffinity.forEach((weight, cat) => {
        if (cat.length >= 3 && captionLower.includes(cat)) {
          score += weight * 6;
        }
      });

      // C. Followed creator boost
      if (followingUserIds.includes(reel.userId)) {
        score += 60;
      }

      // D. Engagement Quality (Likes, Comments, Views)
      const engagement = (reel.likeCount * 3) + (reel.commentCount * 5) + (reel.viewCount * 0.1);
      score += Math.min(engagement, 100);

      // E. Recency Curve (smoother decay, up to 40 pts)
      const ageHours = Math.max(0, (Date.now() - new Date(reel.createdAt).getTime()) / (1000 * 60 * 60));
      const recencyBonus = Math.max(0, 40 - (ageHours * 0.2));
      score += recencyBonus;

      // F. Dynamic Refresh Jitter (0-15 pts) for exciting variety on pull-to-refresh
      score += Math.random() * 15;

      return { reel, score, isWatched };
    });

    // Sort by score descending
    scoredReels.sort((a, b) => b.score - a.score);

    // 4. Category & Creator Diversity Interleaving (avoid 3 same-creator in a row)
    const selected: typeof reels = [];
    const remaining = [...scoredReels];

    while (selected.length < limit && remaining.length > 0) {
      const lastReel = selected[selected.length - 1];
      let pickIdx = 0;

      if (lastReel && remaining.length > 1) {
        // Avoid back-to-back same creator if alternative available in top 3
        const altIdx = remaining.findIndex((r) => r.reel.userId !== lastReel.userId);
        if (altIdx !== -1 && altIdx <= 3) {
          pickIdx = altIdx;
        }
      }

      selected.push(remaining.splice(pickIdx, 1)[0].reel);
    }

    // 5. Hydrate viewer-specific interaction flags
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
            category: true,
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
      user: {
        id: reel.user.id,
        username: reel.user.username,
        displayName: reel.user.displayName,
        profilePicUrl: reel.user.profilePicUrl,
        isVerified: reel.user.isVerified,
        category: reel.user.category,
      },
      sound: reel.sound,
      hashtags: reel.hashtags.map((h: any) => h.hashtag.tag),
      isLiked: likedSet.has(reel.id),
      isSaved: savedSet.has(reel.id),
      isFollowing: followingSet.has(reel.userId),
      isOwnReel: viewerId ? reel.userId === viewerId : false,
    }));
  }
}

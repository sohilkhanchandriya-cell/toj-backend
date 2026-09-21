import request from 'supertest';
import app from '../src/app';
import prisma from '../src/prisma';

describe('TOJ Reels Backend API Test Suite', () => {
  let authToken: string;
  let testUserId: string;
  let sampleReelId: string;
  let targetCreatorId: string;

  beforeAll(async () => {
    // Create an isolated test creator & test reel
    const creator = await prisma.user.create({
      data: {
        username: 'test_creator_temp',
        displayName: 'Test Creator',
        phone: '+919999911111',
      },
    });
    targetCreatorId = creator.id;

    const reel = await prisma.reel.create({
      data: {
        userId: creator.id,
        videoUrl: 'http://localhost:5000/uploads/reels/test.mp4',
        thumbnailUrl: 'http://localhost:5000/uploads/thumbnails/test.jpg',
        caption: 'Automated test reel #testing',
        status: 'live',
        privacy: 'public',
      },
    });
    sampleReelId = reel.id;
  });

  afterAll(async () => {
    // Cleanup test data cleanly
    if (sampleReelId) {
      await prisma.comment.deleteMany({ where: { reelId: sampleReelId } }).catch(() => {});
      await prisma.like.deleteMany({ where: { reelId: sampleReelId } }).catch(() => {});
      await prisma.savedReel.deleteMany({ where: { reelId: sampleReelId } }).catch(() => {});
      await prisma.reel.delete({ where: { id: sampleReelId } }).catch(() => {});
    }
    if (testUserId) {
      await prisma.follow.deleteMany({ where: { followerId: testUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    if (targetCreatorId) {
      await prisma.user.delete({ where: { id: targetCreatorId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe('Health Check', () => {
    it('should return 200 and healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.app).toContain('TOJ');
    });
  });

  describe('Authentication Flow', () => {
    const testPhone = '+919999988888';

    it('should request mobile OTP successfully', async () => {
      const res = await request(app)
        .post('/auth/register/mobile')
        .send({ phone: testPhone });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.devOtp).toBeDefined();
    });

    it('should verify OTP and return tokens + user', async () => {
      const res = await request(app)
        .post('/auth/verify-otp')
        .send({
          phone: testPhone,
          otp: '123456',
          username: 'test_scroller',
          displayName: 'Test Scroller',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();

      authToken = res.body.accessToken;
      testUserId = res.body.user.id;
    });

    it('should fetch own profile using Bearer token', async () => {
      const res = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe('test_scroller');
      expect(res.body.stats).toBeDefined();
    });
  });

  describe('Reels & Feed Engine', () => {
    it('should retrieve algorithmic For You feed with metadata', async () => {
      const res = await request(app)
        .get('/reels/feed?type=foryou')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.reels)).toBe(true);
      expect(res.body.reels.length).toBeGreaterThan(0);

      const firstReel = res.body.reels[0];
      expect(firstReel.videoUrl).toBeDefined();
      expect(firstReel.user).toBeDefined();
      expect(firstReel.isLiked).toBe(false);
    });

    it('should record view count', async () => {
      const res = await request(app).post(`/reels/${sampleReelId}/view`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.viewCount).toBe('number');
    });
  });

  describe('Engagement (Likes & Comments)', () => {
    it('should like a reel and increment counter', async () => {
      const res = await request(app)
        .post(`/engagement/reels/${sampleReelId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isLiked).toBe(true);
    });

    it('should unlike a reel and decrement counter', async () => {
      const res = await request(app)
        .delete(`/engagement/reels/${sampleReelId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isLiked).toBe(false);
    });

    it('should add a comment to a reel', async () => {
      const res = await request(app)
        .post(`/engagement/reels/${sampleReelId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Incredible reel! 🔥 Loved the music!' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.comment.text).toBe('Incredible reel! 🔥 Loved the music!');
    });

    it('should fetch threaded comments for a reel', async () => {
      const res = await request(app).get(`/engagement/reels/${sampleReelId}/comments`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.comments)).toBe(true);
    });

    it('should bookmark (save) a reel and unsave', async () => {
      const saveRes = await request(app)
        .post(`/engagement/reels/${sampleReelId}/save`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(saveRes.status).toBe(200);
      expect(saveRes.body.isSaved).toBe(true);

      const getSaved = await request(app)
        .get('/engagement/saved')
        .set('Authorization', `Bearer ${authToken}`);
      expect(getSaved.status).toBe(200);
      expect(getSaved.body.reels.length).toBeGreaterThan(0);

      const unsaveRes = await request(app)
        .delete(`/engagement/reels/${sampleReelId}/save`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(unsaveRes.status).toBe(200);
      expect(unsaveRes.body.isSaved).toBe(false);
    });
  });

  describe('Follow & Follow-Back Engine', () => {
    it('should follow a creator and check suggestions', async () => {
      const followRes = await request(app)
        .post(`/follow/user/${targetCreatorId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(followRes.status).toBe(201);
      expect(followRes.body.success).toBe(true);

      const suggestionsRes = await request(app)
        .get('/follow/suggestions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(suggestionsRes.status).toBe(200);
      expect(suggestionsRes.body.success).toBe(true);
      expect(Array.isArray(suggestionsRes.body.discoverSuggestions)).toBe(true);
    });
  });

  describe('Search & Explore Grid', () => {
    it('should search creators by query', async () => {
      const res = await request(app).get('/search/users?q=creator');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.users.length).toBeGreaterThan(0);
      expect(res.body.users[0].username).toBe('test_creator_temp');
    });

    it('should return trending explore items', async () => {
      const res = await request(app).get('/search/trending');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.trendingReels).toBeDefined();
      expect(res.body.trendingHashtags).toBeDefined();
      expect(res.body.trendingSounds).toBeDefined();
    });
  });

  describe('Settings & Moderation', () => {
    it('should submit a content report', async () => {
      const res = await request(app)
        .post('/settings/report')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reelId: sampleReelId,
          reason: 'Spam or misleading content',
          details: 'Verified test report submission',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return app configuration and guidelines', async () => {
      const res = await request(app).get('/settings/config');
      expect(res.status).toBe(200);
      expect(res.body.features.musicEnabled).toBe(true);
    });
  });
});

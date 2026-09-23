import { Router } from 'express';
import { EngagementController } from '../controllers/engagementController';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

// Likes
router.post('/reels/:id/like', requireAuth, EngagementController.likeReel);
router.delete('/reels/:id/like', requireAuth, EngagementController.unlikeReel);

// Comments
router.get('/reels/:id/comments', optionalAuth, EngagementController.getComments);
router.post('/reels/:id/comments', optionalAuth, EngagementController.addComment);
router.delete('/comments/:id', requireAuth, EngagementController.deleteComment);

// Bookmarks / Saved
router.post('/reels/:id/save', requireAuth, EngagementController.saveReel);
router.delete('/reels/:id/save', requireAuth, EngagementController.unsaveReel);
router.get('/saved', requireAuth, EngagementController.getSavedReels);

export default router;

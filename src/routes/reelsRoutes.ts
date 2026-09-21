import { Router } from 'express';
import { ReelsController } from '../controllers/reelsController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { uploadMedia } from '../middleware/upload';

const router = Router();

router.get('/feed', optionalAuth, ReelsController.getFeed);
router.post(
  '/',
  requireAuth,
  uploadMedia.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  ReelsController.uploadReel
);
router.get('/:id', optionalAuth, ReelsController.getReelById);
router.delete('/:id', requireAuth, ReelsController.deleteReel);
router.post('/:id/view', optionalAuth, ReelsController.recordView);
router.get('/hashtag/:tag', optionalAuth, ReelsController.getReelsByHashtag);
router.get('/sound/:id', optionalAuth, ReelsController.getReelsBySound);

export default router;

import { Router } from 'express';
import { FollowController } from '../controllers/followController';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

router.post('/user/:userId', requireAuth, FollowController.followUser);
router.delete('/user/:userId', requireAuth, FollowController.unfollowUser);
router.post('/user/:userId/accept', requireAuth, FollowController.acceptFollow);
router.post('/user/:userId/reject', requireAuth, FollowController.rejectFollow);
router.get('/suggestions', requireAuth, FollowController.getSuggestions);
router.get('/users/:id/followers', optionalAuth, FollowController.getFollowers);
router.get('/users/:id/following', optionalAuth, FollowController.getFollowing);

export default router;

import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { uploadMedia } from '../middleware/upload';

const router = Router();

router.get('/me', requireAuth, UserController.getMe);
router.put('/me', requireAuth, UserController.updateMe);
router.put('/me/username', requireAuth, UserController.updateUsername);
router.post('/me/profile-picture', requireAuth, uploadMedia.single('avatar'), UserController.uploadAvatar);
router.get('/:username', optionalAuth, UserController.getProfileByUsername);

export default router;

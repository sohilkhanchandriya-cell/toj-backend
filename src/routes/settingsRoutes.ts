import { Router } from 'express';
import { SettingsController } from '../controllers/settingsController';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

router.post('/report', requireAuth, SettingsController.reportContent);
router.post('/block', requireAuth, SettingsController.blockUser);
router.post('/unblock', requireAuth, SettingsController.unblockUser);
router.get('/blocked-users', requireAuth, SettingsController.getBlockedUsers);
router.get('/config', optionalAuth, SettingsController.getAppConfig);
router.get('/guidelines', optionalAuth, SettingsController.getGuidelines);

export default router;

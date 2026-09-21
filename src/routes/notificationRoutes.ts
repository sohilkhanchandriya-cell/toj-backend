import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, NotificationController.getNotifications);
router.get('/unread-count', requireAuth, NotificationController.getUnreadCount);
router.post('/read-all', requireAuth, NotificationController.markAllAsRead);
router.post('/:id/read', requireAuth, NotificationController.markAsRead);

export default router;

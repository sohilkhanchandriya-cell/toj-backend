import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { uploadMedia } from '../middleware/upload';

const router = Router();

router.post('/register', uploadMedia.single('avatar'), AuthController.register);
router.get('/check-username', AuthController.checkUsername);
router.post('/login', AuthController.login);
router.post('/change-password', requireAuth, AuthController.changePassword);
router.post('/register/mobile', AuthController.requestMobileOtp);
router.post('/verify-otp', AuthController.verifyMobileOtp);
router.post('/register/email', AuthController.registerEmail);
router.post('/social/google', AuthController.socialLogin);
router.post('/social/facebook', AuthController.socialLogin);
router.post('/refresh-token', AuthController.refreshToken);
router.delete('/account', requireAuth, AuthController.deleteAccount);
router.post('/seed-bulk-creators', AuthController.seedBulkCreators);
router.post('/repair-user-reels', AuthController.repairUserReels);

export default router;

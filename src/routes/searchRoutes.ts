import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { optionalAuth } from '../middleware/auth';

const router = Router();

router.get('/users', optionalAuth, SearchController.searchUsers);
router.get('/hashtags', optionalAuth, SearchController.searchHashtags);
router.get('/sounds', optionalAuth, SearchController.searchSounds);
router.get('/trending', optionalAuth, SearchController.getExplore);

export default router;

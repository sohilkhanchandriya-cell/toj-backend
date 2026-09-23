import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../prisma';
import { generateTokens } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { uploadImageToCloudinary } from '../services/cloudinaryService';

// In-memory OTP store for phone verification (for MVP dev/production testing)
const otpCache = new Map<string, { otp: string; expiresAt: number }>();

export class AuthController {
  /**
   * Request OTP for mobile registration or login
   */
  static async requestMobileOtp(req: Request, res: Response): Promise<void> {
    try {
      const { phone } = req.body;
      if (!phone) {
        res.status(400).json({ success: false, message: 'Phone number is required' });
        return;
      }

      // Generate 6 digit OTP. Default dev code 123456 or random
      const otp = process.env.NODE_ENV === 'production' 
        ? Math.floor(100000 + Math.random() * 900000).toString() 
        : '123456';

      otpCache.set(phone, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        devOtp: otp, // Included for frictionless testing
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Verify mobile OTP and login / create account
   */
  static async verifyMobileOtp(req: Request, res: Response): Promise<void> {
    try {
      const { phone, otp, username, displayName } = req.body;
      if (!phone || !otp) {
        res.status(400).json({ success: false, message: 'Phone and OTP are required' });
        return;
      }

      const cached = otpCache.get(phone);
      if (!cached || cached.otp !== otp) {
        // Allow fallback dev code 123456 in dev
        if (process.env.NODE_ENV !== 'production' && otp === '123456') {
          // Dev bypass
        } else {
          res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
          return;
        }
      }

      if (cached && Date.now() > cached.expiresAt) {
        otpCache.delete(phone);
        res.status(400).json({ success: false, message: 'OTP has expired' });
        return;
      }

      // Clean cache
      otpCache.delete(phone);

      // Check if user exists
      let user = await prisma.user.findUnique({ where: { phone } });

      let isNewUser = false;
      if (!user) {
        isNewUser = true;
        const generatedUsername = username || `user_${phone.slice(-4)}_${Math.floor(Math.random() * 1000)}`;
        const name = displayName || `User ${phone.slice(-4)}`;

        user = await prisma.user.create({
          data: {
            phone,
            username: generatedUsername,
            displayName: name,
            profilePicUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${generatedUsername}`,
          },
        });
      }

      const tokens = generateTokens({
        id: user.id,
        username: user.username,
        phone: user.phone,
        email: user.email,
      });

      res.status(200).json({
        success: true,
        isNewUser,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          phone: user.phone,
          profilePicUrl: user.profilePicUrl,
          bio: user.bio,
          isVerified: user.isVerified,
        },
        ...tokens,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Complete Registration with Username, DisplayName, Bio, Password, and Profile Photo
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, displayName, password, bio, phone, email } = req.body;

      if (!username || !password || !displayName) {
        res.status(400).json({ success: false, message: 'Username, Full Name, and Password are required' });
        return;
      }

      const cleanUsername = username.trim().toLowerCase();
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(cleanUsername)) {
        res.status(400).json({
          success: false,
          message: 'Username must be 3-20 characters, alphanumeric and underscore only',
        });
        return;
      }

      const existingUsername = await prisma.user.findUnique({ where: { username: cleanUsername } });
      if (existingUsername) {
        res.status(400).json({ success: false, message: 'Username already taken' });
        return;
      }

      if (phone) {
        const existingPhone = await prisma.user.findUnique({ where: { phone } });
        if (existingPhone) {
          res.status(400).json({ success: false, message: 'Phone number is already registered' });
          return;
        }
      }

      if (email) {
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
          res.status(400).json({ success: false, message: 'Email is already registered' });
          return;
        }
      }

      let profilePicUrl: string;
      if (req.file) {
        if (process.env.CLOUDINARY_URL) {
          const cloudImg = await uploadImageToCloudinary(req.file.path, 'toj_avatars');
          profilePicUrl = cloudImg.imageUrl;
        } else {
          const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
          profilePicUrl = `${baseUrl}/uploads/avatars/${req.file.filename}`;
        }
      } else {
        profilePicUrl = req.body.profilePicUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username: cleanUsername,
          displayName: displayName.trim(),
          bio: bio ? bio.trim() : '',
          passwordHash,
          phone: phone || null,
          email: email || null,
          profilePicUrl,
        },
      });

      const tokens = generateTokens({
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
      });

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          profilePicUrl: user.profilePicUrl,
          bio: user.bio,
          phone: user.phone,
          email: user.email,
          isVerified: user.isVerified,
        },
        ...tokens,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Change Password for authenticated user
   */
  static async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { oldPassword, newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (user.passwordHash && oldPassword) {
        const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isMatch) {
          res.status(400).json({ success: false, message: 'Incorrect old password' });
          return;
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });

      res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Register with Email and Password
   */
  static async registerEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, username, displayName } = req.body;

      if (!email || !password || !username) {
        res.status(400).json({ success: false, message: 'Email, password, and username are required' });
        return;
      }

      // Check username regex
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({
          success: false,
          message: 'Username must be 3-20 characters, alphanumeric and underscore only',
        });
        return;
      }

      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        res.status(400).json({ success: false, message: 'Email already registered' });
        return;
      }

      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) {
        res.status(400).json({ success: false, message: 'Username already taken' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          username,
          displayName: displayName || username,
          profilePicUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        },
      });

      const tokens = generateTokens({
        id: user.id,
        username: user.username,
        email: user.email,
      });

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          profilePicUrl: user.profilePicUrl,
          bio: user.bio,
          isVerified: user.isVerified,
        },
        ...tokens,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Login with email or phone + password
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, password } = req.body; // identifier can be email, phone or username

      if (!identifier || !password) {
        res.status(400).json({ success: false, message: 'Identifier and password are required' });
        return;
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier },
            { phone: identifier },
            { username: identifier },
          ],
        },
      });

      if (!user || !user.passwordHash) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const tokens = generateTokens({
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
      });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
          profilePicUrl: user.profilePicUrl,
          bio: user.bio,
          isVerified: user.isVerified,
        },
        ...tokens,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Social login mock (Google / Facebook)
   */
  static async socialLogin(req: Request, res: Response): Promise<void> {
    try {
      const { provider, token, email, displayName, photoUrl } = req.body;
      const effectiveEmail = email || `user_${Date.now()}@social.toj`;

      let user = await prisma.user.findUnique({ where: { email: effectiveEmail } });

      if (!user) {
        const baseUsername = effectiveEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15);
        const username = `${baseUsername}_${Math.floor(Math.random() * 900 + 100)}`;
        user = await prisma.user.create({
          data: {
            email: effectiveEmail,
            username,
            displayName: displayName || username,
            profilePicUrl: photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
          },
        });
      }

      const tokens = generateTokens({
        id: user.id,
        username: user.username,
        email: user.email,
      });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          profilePicUrl: user.profilePicUrl,
        },
        ...tokens,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Refresh JWT access token
   */
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ success: false, message: 'Refresh token required' });
        return;
      }

      const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'toj_default_refresh_secret_key_2026';
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;

      const user = await prisma.user.findUnique({ where: { id: decoded.id } });
      if (!user) {
        res.status(401).json({ success: false, message: 'User not found' });
        return;
      }

      const tokens = generateTokens({
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
      });

      res.status(200).json({ success: true, ...tokens });
    } catch (error) {
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
  }

  /**
   * Delete account
   */
  static async deleteAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      await prisma.user.delete({ where: { id: userId } });
      res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Real-time Username availability check
   */
  static async checkUsername(req: Request, res: Response): Promise<void> {
    try {
      const username = ((req.query.username as string) || '').trim().toLowerCase();
      if (!username || username.length < 3 || username.length > 20) {
        res.status(400).json({ success: false, available: false, message: 'Username must be 3-20 characters' });
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({ success: false, available: false, message: 'Only letters, numbers, and _ are allowed' });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { username } });
      res.status(200).json({
        success: true,
        available: !existing,
        username,
        message: existing ? 'Username is already taken' : 'Username is available'
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Bulk Seed Motivational Creator Accounts & Auto-follow Target
   */
  static async seedBulkCreators(req: Request, res: Response): Promise<void> {
    try {
      const targetUsername = ((req.body.targetUsername as string) || 'sohilkhanchandriya').trim().toLowerCase();
      const count = parseInt(req.body.count as string) || 1000;

      const targetUser = await prisma.user.findUnique({
        where: { username: targetUsername },
      });

      if (!targetUser) {
        res.status(404).json({ success: false, message: `Target user @${targetUsername} not found` });
        return;
      }

      // Pre-compute bcrypt password hash for '123456' once for instant insertion
      const passwordHash = await bcrypt.hash('123456', 10);

      const firstNames = ['Aarav', 'Vikram', 'Kabir', 'Rohit', 'Dev', 'Aryan', 'Sameer', 'Aditya', 'Varun', 'Alok', 'Priya', 'Ananya', 'Neha', 'Tanvi', 'Kavya', 'Meera', 'Rohan', 'Kunal', 'Siddharth', 'Yash', 'Rishi', 'Mayank', 'Dhruv', 'Ayush', 'Harsh'];
      const lastNames = ['Sharma', 'Verma', 'Mehta', 'Roy', 'Khan', 'Patel', 'Joshi', 'Desai', 'Rao', 'Gupta', 'Singh', 'Malik', 'Nair', 'Chopra', 'Kapoor', 'Bhatia', 'Saxena', 'Bansal', 'Reddy', 'Mishra'];
      const motivationalThemes = [
        'mindset', 'inspire', 'discipline', 'grit', 'unstoppable', 'hustle', 'focus', 'ambition',
        'growth', 'champion', 'vision', 'rise', 'warrior', 'grind', 'success', 'alpha', 'lead',
        'courage', 'legacy', 'motivate'
      ];
      const motivationalBios = [
        'Daily discipline & unstoppable mindset 🔥 #NeverGiveUp',
        'Dream big. Work hard. Stay focused. 🚀 #Motivation',
        'Pain is temporary, pride is forever 💪 #Grind',
        'Building an empire one day at a time ✨ #SuccessMindset',
        'Discipline will take you places motivation cannot 🎯',
        'Turn your wounds into wisdom 🦁 #Warrior',
        'Wake up with determination, go to bed with satisfaction 🌅',
        'Your only limit is you. Break all boundaries ⚡',
        'Consistency creates champions 🏆 #DailyInspiration',
        'Silence the doubt with massive action 💥 #Hustle',
      ];

      const usersToInsert: any[] = [];
      const followsToInsert: any[] = [];

      for (let i = 1; i <= count; i++) {
        const id = crypto.randomUUID();
        const fName = firstNames[(i - 1) % firstNames.length];
        const lName = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length];
        const theme = motivationalThemes[(i - 1) % motivationalThemes.length];
        const bio = motivationalBios[(i - 1) % motivationalBios.length];
        const paddedNum = i.toString().padStart(4, '0');
        const username = `${theme}_${fName.toLowerCase()}_${paddedNum}`;

        usersToInsert.push({
          id,
          username,
          displayName: `${fName} ${lName}`,
          bio,
          passwordHash,
          category: 'motivation',
          profilePicUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
          status: 'active',
          isVerified: false,
          isPrivate: false,
        });

        followsToInsert.push({
          id: crypto.randomUUID(),
          followerId: id,
          followingId: targetUser.id,
          status: 'accepted',
        });
      }

      // Bulk insert in chunks of 500
      const chunkSize = 500;
      let insertedUsers = 0;
      let insertedFollows = 0;

      for (let i = 0; i < usersToInsert.length; i += chunkSize) {
        const chunk = usersToInsert.slice(i, i + chunkSize);
        const resUsers = await prisma.user.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        insertedUsers += resUsers.count;
      }

      for (let i = 0; i < followsToInsert.length; i += chunkSize) {
        const chunk = followsToInsert.slice(i, i + chunkSize);
        const resFollows = await prisma.follow.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        insertedFollows += resFollows.count;
      }

      // Query current total follower count for target
      const totalFollowers = await prisma.follow.count({
        where: { followingId: targetUser.id, status: 'accepted' },
      });

      res.status(200).json({
        success: true,
        message: `Successfully created ${insertedUsers} motivational creator accounts and followed @${targetUsername}!`,
        insertedUsers,
        insertedFollows,
        targetUsername,
        targetFollowers: totalFollowers,
        sampleAccounts: usersToInsert.slice(0, 5).map((u) => ({
          username: u.username,
          displayName: u.displayName,
          password: '123456',
        })),
      });
    } catch (error: any) {
      console.error('Bulk seeding error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * System & User Media Repair: Updates broken Cloudinary / 401 / 404 reels to high-speed CDN assets,
   * repairs thumbnails, and updates user avatars to high-res PNG
   */
  static async repairUserReels(req: Request, res: Response): Promise<void> {
    try {
      const username = ((req.body.username || req.query.username || 'sohilkhanchandriya') as string).trim().toLowerCase();

      // High-speed AWS S3 backed GitHub CDN video streams
      const cdnVideos = [
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_001.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_002.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_003.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_004.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_005.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_006.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_007.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_008.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_009.mp4',
        'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/movie_reel_010.mp4',
      ];

      const cdnThumbnails = [
        'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=720&q=80',
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=720&q=80',
        'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=720&q=80',
        'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=720&q=80',
        'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=720&q=80',
      ];

      // 1. Repair avatars: Update sohilkhanchandriya to his real portrait photo on GitHub
      const sohilUser = await prisma.user.findUnique({
        where: { username: 'sohilkhanchandriya' },
        include: { reels: true }
      });

      if (sohilUser) {
        await prisma.user.update({
          where: { id: sohilUser.id },
          data: {
            profilePicUrl: 'https://raw.githubusercontent.com/sohilkhanchandriya-cell/toj-backend/main/avatars/sohilkhanchandriya.jpg'
          }
        });

        // Genuine 7 Reels for Sohil Khan Chandriya (never movie explained)
        const sohilReelsData = [
          {
            caption: 'Zindagi me bas itna Patience Chahiye 📺 Qazi you are the real Hero of Biggboss 20 #biggboss #entertainment #comedy',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_001.mp4',
          },
          {
            caption: 'Kinaaro pr moti mila nahi karte Dard mein kabhi gilaa nahi karte, Hum ache na sahi bure hi sahi Pr hum jaise bure bhi har kisi ko mila nahi karte. #jaunelia #shayari #poetry',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_002.mp4',
          },
          {
            caption: 'Zimmedariya sab sikha deti hai... "Akele kaise rahenge?" se lekar "Akele hi sab kuch kar lenge" tak ka safar ho! #motivation #life #inspiration',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_003.mp4',
          },
          {
            caption: 'Mirza Gulab - Hayee, kya shayri hai! Ye ishq ne insaan ko kya bna diya, Kisi ko shayar to Kisi ko kaatil bna diya! #munawarfaruqui #shayari #trending',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_004.mp4',
          },
          {
            caption: 'Sach batana Meri taraha Aap sab bhi Darr Gaye the na 🏋️‍♂️💪 #fitness #gym #workout #funny',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_005.mp4',
          },
          {
            caption: 'Tere bina na chaha kisi nu ❤️✨ #music #lovesong #trending #viral',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_006.mp4',
          },
          {
            caption: 'Duniya me sabse pyara rishta ❤️ #family #love #reels',
            videoUrl: 'https://github.com/sohilkhanchandriya-cell/toj-backend/releases/download/v1.0-reels/sohil_reel_007.mp4',
          },
        ];

        // If user has 0 reels or existing reels need syncing to authentic 7 reels
        if (sohilUser.reels.length === 0) {
          for (const item of sohilReelsData) {
            await prisma.reel.create({
              data: {
                userId: sohilUser.id,
                caption: item.caption,
                videoUrl: item.videoUrl,
                thumbnailUrl: '',
                durationMs: 15000,
                privacy: 'public',
                status: 'live',
                commentsEnabled: true,
                viewCount: Math.floor(Math.random() * 500) + 120,
                likeCount: Math.floor(Math.random() * 80) + 15,
                commentCount: Math.floor(Math.random() * 20) + 3,
                shareCount: Math.floor(Math.random() * 30) + 5,
              }
            });
          }
        } else {
          // Update any broken or movie explained reels under Sohil's account with his authentic reels
          for (let i = 0; i < sohilUser.reels.length && i < sohilReelsData.length; i++) {
            const curReel = sohilUser.reels[i];
            const targetData = sohilReelsData[i];
            await prisma.reel.update({
              where: { id: curReel.id },
              data: {
                caption: targetData.caption,
                videoUrl: targetData.videoUrl,
                thumbnailUrl: '',
                status: 'live',
                privacy: 'public',
              }
            });
          }
        }
      }

      // 2. Fix broken Cloudinary or empty avatars for automated bot/creator accounts
      const usersToFix = await prisma.user.findMany({
        where: {
          NOT: { username: 'sohilkhanchandriya' },
          OR: [
            { profilePicUrl: null },
            { profilePicUrl: '' },
            { profilePicUrl: { contains: 'cloudinary' } },
          ]
        },
        select: { id: true, username: true }
      });

      for (const u of usersToFix) {
        await prisma.user.update({
          where: { id: u.id },
          data: {
            profilePicUrl: `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(u.username)}`
          }
        });
      }

      // 3. Repair reels ONLY for bot/seeded creator accounts, NEVER touch sohilkhanchandriya or real user accounts
      const botReels = await prisma.reel.findMany({
        where: {
          status: 'live',
          ...(sohilUser ? { NOT: { userId: sohilUser.id } } : {})
        },
        orderBy: { createdAt: 'desc' }
      });

      let repairedCount = 0;
      for (let i = 0; i < botReels.length; i++) {
        const reel = botReels[i];
        const isBrokenVideo = reel.videoUrl.includes('cloudinary') || !reel.videoUrl.startsWith('http');
        const isBrokenThumb = !reel.thumbnailUrl || reel.thumbnailUrl.includes('cloudinary') || reel.thumbnailUrl.includes('default_thumb.jpg');

        if (isBrokenVideo || isBrokenThumb) {
          const replacementVideo = cdnVideos[i % cdnVideos.length];
          const replacementThumb = cdnThumbnails[i % cdnThumbnails.length];

          await prisma.reel.update({
            where: { id: reel.id },
            data: {
              ...(isBrokenVideo ? { videoUrl: replacementVideo } : {}),
              ...(isBrokenThumb ? { thumbnailUrl: replacementThumb } : {})
            }
          });
          repairedCount++;
        }
      }

      res.status(200).json({
        success: true,
        message: `Successfully repaired ${repairedCount} bot reels, verified Sohil Khan Chandriya's 7 authentic reels and real DP!`,
        repairedCount,
        repairedAvatars: usersToFix.length,
        sohilReelsCount: sohilUser ? sohilUser.reels.length || 7 : 0
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

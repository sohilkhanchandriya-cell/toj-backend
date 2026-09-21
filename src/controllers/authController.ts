import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
}

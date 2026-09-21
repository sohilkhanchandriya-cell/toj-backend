import { Request } from 'express';

export interface AuthUser {
  id: string;
  username: string;
  email?: string | null;
  phone?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface FeedQuery {
  type?: 'foryou' | 'following';
  cursor?: string;
  limit?: string;
}

export interface ReelUploadBody {
  caption?: string;
  soundId?: string;
  hashtags?: string; // comma separated or JSON string
  privacy?: 'public' | 'followers' | 'private';
  commentsEnabled?: string | boolean;
  durationMs?: string | number;
}

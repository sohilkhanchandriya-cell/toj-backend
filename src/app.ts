import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import followRoutes from './routes/followRoutes';
import reelsRoutes from './routes/reelsRoutes';
import engagementRoutes from './routes/engagementRoutes';
import searchRoutes from './routes/searchRoutes';
import notificationRoutes from './routes/notificationRoutes';
import settingsRoutes from './routes/settingsRoutes';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import fs from 'fs';

// Static media uploads serving
const uploadsDir = path.join(__dirname, '../uploads');

// Fallback for thumbnails so default_thumb.jpg and missing thumbnails never 404
app.get('/uploads/thumbnails/:file', (req: Request, res: Response, next: NextFunction) => {
  const filePath = path.join(uploadsDir, 'thumbnails', req.params.file);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return res.redirect(302, 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=720&q=80');
});

// Fallback for avatars so missing avatars never 404
app.get('/uploads/avatars/:file', (req: Request, res: Response, next: NextFunction) => {
  const filePath = path.join(uploadsDir, 'avatars', req.params.file);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  const name = path.parse(req.params.file).name;
  return res.redirect(302, `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(name)}`);
});

// Fallback for reels so wiped ephemeral files seamlessly redirect to streaming CDN
app.get('/uploads/reels/:file', (req: Request, res: Response, next: NextFunction) => {
  const filePath = path.join(uploadsDir, 'reels', req.params.file);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
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
  let hash = 0;
  for (let i = 0; i < req.params.file.length; i++) hash += req.params.file.charCodeAt(i);
  const cdnUrl = cdnVideos[Math.abs(hash) % cdnVideos.length];
  return res.redirect(302, cdnUrl);
});

app.use('/uploads', express.static(uploadsDir));

// Media uploads directory explorer
app.get(['/uploads', '/uploads/'], (req: Request, res: Response) => {
  const categories = ['reels', 'thumbnails', 'avatars', 'sounds'];
  let filesHtml = '';

  for (const cat of categories) {
    const catPath = path.join(uploadsDir, cat);
    let files: string[] = [];
    if (fs.existsSync(catPath)) {
      files = fs.readdirSync(catPath);
    }

    filesHtml += `
      <div style="background:#1e1e1e;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #333;">
        <h3 style="margin-top:0;color:#25F4EE;text-transform:capitalize;">📁 ${cat} (${files.length} files)</h3>
        ${
          files.length === 0
            ? '<p style="color:#888;font-size:14px;margin:0;">No files uploaded in this folder yet.</p>'
            : `<ul style="margin:0;padding-left:20px;color:#ddd;font-size:14px;">
                ${files
                  .map(
                    (f) =>
                      `<li style="margin-bottom:6px;"><a href="/uploads/${cat}/${encodeURIComponent(
                        f
                      )}" target="_blank" style="color:#FF2C55;text-decoration:none;font-weight:bold;">${f}</a></li>`
                  )
                  .join('')}
              </ul>`
        }
      </div>
    `;
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>TOJ Media Storage Explorer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#121212; color:#fff; padding:30px; margin:0; line-height:1.5; }
          .container { max-width:800px; margin:0 auto; }
          .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:bold; background:#FF2C55; color:#fff; margin-bottom:12px; }
          a.btn { display:inline-block; background:#333; color:#fff; padding:8px 16px; border-radius:8px; text-decoration:none; font-size:14px; margin-top:12px; }
          a.btn:hover { background:#444; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="badge">📹 MEDIA STORAGE</div>
          <h1 style="margin:0 0 8px 0;font-size:28px;">TOJ Uploads Directory</h1>
          <p style="color:#aaa;margin-bottom:24px;">This directory stores user-uploaded vertical video reels, cover thumbnails, profile avatars, and audio tracks.</p>
          ${filesHtml}
          <a href="/" class="btn">← Back to API Dashboard</a>
        </div>
      </body>
    </html>
  `);
});

// Interactive API Dashboard at root /
app.get('/', (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>TOJ Reels API Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0f0f12; color:#ffffff; padding:40px 20px; margin:0; }
          .container { max-width: 860px; margin: 0 auto; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #282832; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: 900; letter-spacing: 2px; color: #FF2C55; display:flex; align-items:center; gap:10px; }
          .status { display: inline-flex; align-items: center; gap: 8px; background: #162a22; color: #2ecc71; border: 1px solid #27ae60; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
          .dot { width: 8px; height: 8px; background: #2ecc71; border-radius: 50%; box-shadow: 0 0 8px #2ecc71; }
          .card { background: #1a1a24; border: 1px solid #2c2c3c; border-radius: 14px; padding: 22px; margin-bottom: 20px; }
          .card h2 { margin-top: 0; font-size: 18px; color: #25F4EE; display: flex; align-items: center; gap: 8px; }
          .endpoint-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 14px; }
          .endpoint-btn { display: flex; flex-direction: column; background: #242434; padding: 14px; border-radius: 10px; text-decoration: none; color: #fff; border: 1px solid #36364a; transition: all 0.2s; }
          .endpoint-btn:hover { background: #2d2d42; border-color: #FF2C55; transform: translateY(-2px); }
          .endpoint-method { font-size: 11px; font-weight: 800; color: #25F4EE; text-transform: uppercase; margin-bottom: 4px; }
          .endpoint-url { font-family: monospace; font-size: 13px; color: #fff; word-break: break-all; }
          .endpoint-desc { font-size: 12px; color: #9a9ab0; margin-top: 6px; }
          code { background: #121218; padding: 3px 6px; border-radius: 4px; color: #FF2C55; font-size: 13px; }
          pre { background: #121218; padding: 14px; border-radius: 8px; overflow-x: auto; color: #ddd; font-size: 13px; border: 1px solid #282836; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">
              <span>▶</span> TOJ REELS API
            </div>
            <div class="status">
              <span class="dot"></span> Server Online (Port 5000)
            </div>
          </div>

          <div class="card">
            <h2>🚀 Quick Test Endpoints (Click to View in Browser)</h2>
            <p style="color:#aaa;font-size:14px;margin:0 0 12px 0;">Click any endpoint below to inspect real live JSON data directly in your browser:</p>
            <div class="endpoint-grid">
              <a class="endpoint-btn" href="/reels/feed?type=foryou" target="_blank">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/reels/feed?type=foryou</span>
                <span class="endpoint-desc">View Algorithmic For You reels feed</span>
              </a>
              <a class="endpoint-btn" href="/search/trending" target="_blank">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/search/trending</span>
                <span class="endpoint-desc">Explore trending reels, hashtags & sounds</span>
              </a>
              <a class="endpoint-btn" href="/health" target="_blank">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/health</span>
                <span class="endpoint-desc">Server health & uptime check</span>
              </a>
              <a class="endpoint-btn" href="/uploads" target="_blank">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/uploads</span>
                <span class="endpoint-desc">Browse uploaded media files</span>
              </a>
              <a class="endpoint-btn" href="/settings/config" target="_blank">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/settings/config</span>
                <span class="endpoint-desc">Feature flags & app version config</span>
              </a>
              <a class="endpoint-btn" href="/settings/guidelines" target="_blank">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/settings/guidelines</span>
                <span class="endpoint-desc">Community guidelines & safety policy</span>
              </a>
            </div>
          </div>

          <div class="card">
            <h2>📱 Mobile OTP Testing Note</h2>
            <p style="color:#bbb;font-size:14px;">You can test authentication with any phone number. In development, the default verification code is <code>123456</code>.</p>
            <pre>POST /auth/register/mobile
{ "phone": "+919876543210" }

POST /auth/verify-otp
{ "phone": "+919876543210", "otp": "123456" }</pre>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    app: 'TOJ Reels Backend API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount modular API routers matching TRD specification
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/follow', followRoutes);
app.use('/reels', reelsRoutes);
app.use('/engagement', engagementRoutes);
app.use('/search', searchRoutes);
app.use('/notifications', notificationRoutes);
app.use('/settings', settingsRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

export default app;

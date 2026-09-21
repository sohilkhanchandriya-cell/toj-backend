import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 TOJ Reels Backend Server running at http://${HOST}:${PORT}`);
  console.log(`🌐 Local Network (LAN) URL: http://10.221.210.170:${PORT}`);
  console.log(`📹 Uploads directory served at http://10.221.210.170:${PORT}/uploads`);
  console.log(`🩺 Health check available at http://10.221.210.170:${PORT}/health`);
});

import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Automatically extracts a video frame thumbnail using OpenCV in Python
 * Falls back cleanly to default_thumb.jpg if extraction fails.
 */
export async function generateThumbnailFromVideo(
  videoPath: string,
  targetFilename: string
): Promise<string> {
  const thumbnailsDir = path.join(__dirname, '../../uploads/thumbnails');
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  const outputThumbPath = path.join(thumbnailsDir, targetFilename);

  const pythonScript = `
import cv2, sys, os
video_path = sys.argv[1]
output_path = sys.argv[2]
try:
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, 500)
    ret, frame = cap.read()
    if not ret:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ret, frame = cap.read()
    if ret:
        cv2.imwrite(output_path, frame)
        print("OK")
    else:
        print("FAIL")
    cap.release()
except Exception as e:
    print(f"ERROR: {e}")
`;

  return new Promise((resolve) => {
    execFile('python', ['-c', pythonScript, videoPath, outputThumbPath], (err, stdout) => {
      if (!err && stdout.includes('OK') && fs.existsSync(outputThumbPath)) {
        resolve(targetFilename);
      } else {
        resolve('default_thumb.jpg');
      }
    });
  });
}

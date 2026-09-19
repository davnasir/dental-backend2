import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ApiError } from '../utils/apiResponse.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const dirPath = path.resolve(__dirname, '../../', config.uploads.dir);

if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dirPath),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME.get(file.mimetype) || path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const extAllowed = ['.jpg', '.jpeg', '.png', '.webp'].includes(
    path.extname(file.originalname).toLowerCase()
  );
  if (ALLOWED_MIME.has(file.mimetype) && extAllowed) {
    return cb(null, true);
  }
  return cb(new ApiError(400, 'Invalid file type. Only JPG, JPEG, PNG, WEBP are allowed.'));
};

export const upload = multer({
  storage,
  limits: {
    fileSize: config.uploads.maxFileSize,
  },
  fileFilter,
});

export const singleImage = upload.single('image');
export const imagesArray = upload.array('images', 10);
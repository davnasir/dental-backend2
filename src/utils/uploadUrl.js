// Multer exposes the absolute filesystem path on req.file.path, but the API
// stores a web-relative URL (e.g. /uploads/abc.jpg) so the frontend can load
// images through the static /uploads mount. Returns null when no file exists.
export const toUploadUrl = (file) => (file && file.filename ? `/uploads/${file.filename}` : null);
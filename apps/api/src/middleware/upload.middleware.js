const multer = require("multer");

const allowedMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  }
});

function normalizeUploadError(error, _req, _res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    error.status = 413;
    error.message = "File too large. Max size is 20MB";
    return next(error);
  }

  if (error.message === "Unsupported file type") {
    error.status = 400;
    return next(error);
  }

  return next(error);
}

module.exports = { upload, normalizeUploadError };

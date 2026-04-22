// const path = require("path");
// const multer = require("multer");

// const allowedMimes = new Set([
//   "image/jpeg",
//   "image/png",
//   "image/webp",
//   "image/heic",
//   "image/heif",
//   "video/mp4",
//   "video/quicktime",
//   "audio/mpeg",
//   "audio/wav",
//   "audio/x-wav",
//   "audio/webm",
//   "audio/mp4",
//   "audio/aac",
//   "audio/ogg"
// ]);

// /**
//  * Galaxy / iOS often use HEIC; some clients send `application/octet-stream` or a generic type.
//  * Normalize from filename so DB + worker see a proper image MIME.
//  * @param {{ mimetype: string; originalname?: string }} file
//  */
// function normalizeHeicMimeFromFilename(file) {
//   const ext = path.extname(file.originalname || "").toLowerCase();
//   if (ext === ".heif") {
//     file.mimetype = "image/heif";
//   } else if (ext === ".heic") {
//     file.mimetype = "image/heic";
//   }
// }

// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 20 * 1024 * 1024
//   },
//   fileFilter: (_req, file, cb) => {
//     if (!allowedMimes.has(file.mimetype)) {
//       normalizeHeicMimeFromFilename(file);
//     }
//     if (!allowedMimes.has(file.mimetype)) {
//       cb(new Error("Unsupported file type"));
//       return;
//     }
//     cb(null, true);
//   }
// });

// function normalizeUploadError(error, _req, _res, next) {
//   if (!error) {
//     return next();
//   }

//   if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
//     error.status = 413;
//     error.message = "File too large. Max size is 20MB";
//     return next(error);
//   }

//   if (error.message === "Unsupported file type") {
//     error.status = 400;
//     return next(error);
//   }

//   return next(error);
// }

// module.exports = { upload, normalizeUploadError };

const path = require("path");
const multer = require("multer");

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const allowedMimes = new Set([
  // images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",

  // videos
  "video/mp4",
  "video/quicktime",

  // audio
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/alac"
]);

/**
 * Normalize common cases where clients send a generic MIME type
 * but the filename extension is trustworthy enough to map.
 *
 * @param {{ mimetype: string; originalname?: string }} file
 */
function normalizeMimeFromFilename(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();

  // existing image normalization
  if (ext === ".heif") {
    file.mimetype = "image/heif";
    return;
  }
  if (ext === ".heic") {
    file.mimetype = "image/heic";
    return;
  }

  // audio normalization
  if (ext === ".mp3") {
    file.mimetype = "audio/mpeg";
    return;
  }
  if (ext === ".wav") {
    file.mimetype = "audio/wav";
    return;
  }
  if (ext === ".m4a") {
    file.mimetype = "audio/mp4";
    return;
  }
  if (ext === ".aac") {
    file.mimetype = "audio/aac";
    return;
  }
  if (ext === ".ogg") {
    file.mimetype = "audio/ogg";
    return;
  }
  if (ext === ".flac") {
    file.mimetype = "audio/flac";
    return;
  }
  if (ext === ".alac") {
    file.mimetype = "audio/alac";
    return;
  }

  // optional image compatibility
  if (ext === ".jpg" || ext === ".jpeg") {
    file.mimetype = "image/jpeg";
    return;
  }
  if (ext === ".png") {
    file.mimetype = "image/png";
    return;
  }
  if (ext === ".gif") {
    file.mimetype = "image/gif";
    return;
  }
  if (ext === ".webp") {
    file.mimetype = "image/webp";
    return;
  }

  // optional video compatibility
  if (ext === ".mp4") {
    file.mimetype = "video/mp4";
    return;
  }
  if (ext === ".mov") {
    file.mimetype = "video/quicktime";
  }
}

/**
 * @param {{ mimetype?: string; originalname?: string }} file
 * @returns {boolean}
 */
function isAllowedFile(file) {
  const mime = String(file.mimetype || "").trim().toLowerCase();
  return allowedMimes.has(mime);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter: (_req, file, cb) => {
    file.mimetype = String(file.mimetype || "").trim().toLowerCase();

    if (!isAllowedFile(file)) {
      normalizeMimeFromFilename(file);
    }

    if (!isAllowedFile(file)) {
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

module.exports = {
  upload,
  normalizeUploadError,
  allowedMimes,
  MAX_FILE_SIZE_BYTES
};
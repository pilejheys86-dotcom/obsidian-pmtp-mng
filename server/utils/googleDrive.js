// server/utils/googleDrive.js

/**
 * Transform a Google Drive share link to a direct download URL.
 * Non-Google-Drive URLs are returned as-is.
 *
 * Supported input formats:
 *   https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
 *   https://drive.google.com/file/d/{FILE_ID}/view
 *   https://drive.google.com/open?id={FILE_ID}
 *
 * Output:
 *   https://drive.google.com/uc?export=download&id={FILE_ID}
 */
function transformGoogleDriveUrl(url) {
  if (!url) return url;

  // Pattern 1: /file/d/{id}/...
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  // Pattern 2: ?id={id}
  const idMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  }

  // Not a Google Drive link — return as-is
  return url;
}

module.exports = { transformGoogleDriveUrl };

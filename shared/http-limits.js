// 50 MB — headroom above the max realistic payload (~30 MB for 5 inline files at 4.5 MB each as base64).
// See gateway/core/upload-limits.js for per-file and per-message enforcement.
export const JSON_BODY_LIMIT = 50 * 1024 * 1024;

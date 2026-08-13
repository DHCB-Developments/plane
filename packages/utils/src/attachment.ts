/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const generateFileName = (fileName: string) => {
  const date = new Date();
  const timestamp = date.getTime();

  const _fileName = getFileName(fileName);
  const nameWithoutExtension = _fileName.length > 80 ? _fileName.substring(0, 80) : _fileName;
  const extension = getFileExtension(fileName);

  return `${nameWithoutExtension}-${timestamp}.${extension}`;
};

export const getFileExtension = (filename: string) => filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);

export const getFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf(".");

  const nameWithoutExtension = fileName.substring(0, dotIndex);

  return nameWithoutExtension;
};

export type TAttachmentPreviewType = "image" | "video" | "audio" | "pdf" | "text" | "none";

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico"]);
const PREVIEWABLE_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
const PREVIEWABLE_AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"]);
const PREVIEWABLE_TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "log",
  "yaml",
  "yml",
  "xml",
  "toml",
  "ini",
  "conf",
  "env",
  "sql",
  "sh",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "cs",
  "php",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "scss",
  "html",
  "htm",
]);

/**
 * @description returns how an attachment can be previewed in the browser, based on
 * its MIME type (preferred) with the file extension as a fallback
 * @param {string} fileName
 * @param {string | undefined} mimeType
 * @returns {TAttachmentPreviewType} preview type, "none" if the file cannot be previewed
 */
export const getAttachmentPreviewType = (fileName: string, mimeType?: string): TAttachmentPreviewType => {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("text/") || type === "application/json" || type === "application/xml") return "text";

  const extension = getFileExtension(fileName).toLowerCase();
  if (PREVIEWABLE_IMAGE_EXTENSIONS.has(extension)) return "image";
  if (PREVIEWABLE_VIDEO_EXTENSIONS.has(extension)) return "video";
  if (PREVIEWABLE_AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (extension === "pdf") return "pdf";
  if (PREVIEWABLE_TEXT_EXTENSIONS.has(extension)) return "text";

  return "none";
};

export const convertBytesToSize = (bytes: number) => {
  let size;

  if (bytes < 1024 * 1024) {
    size = Math.round(bytes / 1024) + " KB";
  } else {
    size = Math.round(bytes / (1024 * 1024)) + " MB";
  }

  return size;
};

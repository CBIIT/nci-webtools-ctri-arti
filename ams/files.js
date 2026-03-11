import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import { basename, join } from "path";

import { Router } from "express";
import { routeHandler } from "shared/utils.js";

const STAGING_PATH = process.env.FILE_STAGING_PATH || "/tmp/ams-staging";

function userDir(userId) {
  return join(STAGING_PATH, "user", String(userId));
}

function safeName(filename) {
  const name = basename(String(filename));
  if (!name || name === "." || name === "..") return null;
  return name;
}

// POST /files — Upload file
// GET /files — List staging files
// DELETE /files — Delete file

const router = Router();

router.post(
  "/",
  routeHandler(async (req, res) => {
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ error: "filename and content are required" });
    }

    const safe = safeName(filename);
    if (!safe) return res.status(400).json({ error: "Invalid filename" });

    const dir = userDir(req.userId);
    await mkdir(dir, { recursive: true });

    const filePath = join(dir, safe);
    const buffer = Buffer.from(content, "base64");
    await writeFile(filePath, buffer);

    const info = await stat(filePath);
    res.status(201).json({
      filename: safe,
      size: info.size,
      createdAt: info.birthtime.toISOString(),
    });
  })
);

router.get(
  "/",
  routeHandler(async (req, res) => {
    const dir = userDir(req.userId);

    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return res.json([]);
    }

    const files = await Promise.all(
      entries.map(async (filename) => {
        const info = await stat(join(dir, filename));
        return {
          filename,
          size: info.size,
          createdAt: info.birthtime.toISOString(),
        };
      })
    );

    res.json(files);
  })
);

router.delete(
  "/",
  routeHandler(async (req, res) => {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: "filename is required" });
    }

    const safe = safeName(filename);
    if (!safe) return res.status(400).json({ error: "Invalid filename" });

    const filePath = join(userDir(req.userId), safe);

    try {
      await unlink(filePath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({ success: true });
  })
);

export default router;

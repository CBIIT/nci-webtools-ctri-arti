import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { serviceError } from "./utils.js";
import logger from "../logger.js";

const { S3_BUCKET } = process.env;
const s3 = new S3Client();

export async function uploadFile(userId, file, filename) {
  if (!S3_BUCKET) throw serviceError(500, "S3_BUCKET not configured");
  if (!filename) throw serviceError(400, "filename is required");
  if (filename.includes("/") || filename.includes("..")) {
    throw serviceError(400, "Invalid filename");
  }
  if (!file) throw serviceError(400, "File content is required");

  const key = `user/${userId}/${filename}`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );
  } catch (err) {
    logger.error("S3 upload debug:", err.message, "cause:", err.cause?.message || err.cause);
    throw err;
  }

  return {
    filename,
    size: file.size,
    createdAt: new Date().toISOString(),
  };
}

export async function getFiles(userId) {
  if (!S3_BUCKET) throw serviceError(500, "S3_BUCKET not configured");

  const prefix = `user/${userId}/`;
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
    })
  );

  return (result.Contents || []).map((obj) => ({
    filename: obj.Key.replace(prefix, ""),
    size: obj.Size,
    createdAt: obj.LastModified,
  }));
}

export async function deleteFile(userId, filename) {
  if (!S3_BUCKET) throw serviceError(500, "S3_BUCKET not configured");
  if (!filename) throw serviceError(400, "filename is required");
  if (filename.includes("/") || filename.includes("..")) {
    throw serviceError(400, "Invalid filename");
  }

  const key = `user/${userId}/${filename}`;

  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      throw serviceError(404, "File not found");
    }
    throw err;
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );

  return { filename, size: head.ContentLength, createdAt: head.LastModified };
}

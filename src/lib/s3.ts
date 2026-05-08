// src/lib/s3.ts
// AWS S3-Client für STEP-Dateien und Thumbnails — server-only.
// Darf NIEMALS in Client-Komponenten importiert werden.
import { S3Client } from '@aws-sdk/client-s3'

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  ...(process.env.DECOMPOSEDS3_ENDPOINT
    ? { endpoint: process.env.DECOMPOSEDS3_ENDPOINT, forcePathStyle: true }
    : {}),
})

// Bucket-Namen als Konstanten — Pfadkonvention: {part_id}/original.step, {part_id}/view_0.png … view_7.png
export const BUCKET_STEPS = process.env.AWS_S3_BUCKET_STEPS!
export const BUCKET_THUMBNAILS = process.env.AWS_S3_BUCKET_THUMBNAILS!

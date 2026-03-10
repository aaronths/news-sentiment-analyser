import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import path from "path";
import { isPlaceholderSecret } from "../config/news-sources";
import { S3UploadResult } from "../types/article";

const getRequiredBucket = () => process.env.NEWS_DATA_BUCKET?.trim();
const getRegion = () => process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "ap-southeast-2";
const getStorageMode = () => process.env.NEWS_DATA_STORAGE_MODE?.trim().toLowerCase() || "local-file";

const createClient = () => new S3Client({ region: getRegion() });

const buildLocation = (bucket: string, key: string) => `s3://${bucket}/${key}`;
const buildFileLocation = (filePath: string) => `file://${path.resolve(filePath)}`;

export const uploadFileToS3 = async (options: {
  filePath: string;
  key: string;
  contentType: string;
}): Promise<S3UploadResult> => {
  const bucket = getRequiredBucket();
  const storageMode = getStorageMode();

  if (storageMode !== "s3" || !bucket || isPlaceholderSecret(bucket)) {
    return {
      bucket: bucket ?? "",
      key: options.key,
      uploaded: false,
      location: buildFileLocation(options.filePath),
      note: "Mock storage mode is active. Data was written to the local file only.",
    };
  }

  const fileContents = await fs.readFile(options.filePath);
  const client = createClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      Body: fileContents,
      ContentType: options.contentType,
    }),
  );

  return {
    bucket,
    key: options.key,
    uploaded: true,
    location: buildLocation(bucket, options.key),
  };
};

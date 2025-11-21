import { S3Client, GetObjectCommand, paginateListObjectsV2 } from "@aws-sdk/client-s3"

export async function listFiles(bucket, prefix = "") {
    const client = new S3Client();
    const paginator = paginateListObjectsV2({ client }, { Bucket: bucket, Prefix: prefix });
    const files = [];
    for await (const page of paginator) {
        if (page.Contents) {
            for (const item of page.Contents) {
                files.push(item.Key);
            }
        }
    }
    return files;
}

export async function getFile(bucket, key) {
    const s3 = new S3Client();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await s3.send(command);
}

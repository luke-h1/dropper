function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function getEnv() {
  return {
    s3Endpoint: required("S3_ENDPOINT").replace(/\/+$/, ""),
    s3Region: process.env.S3_REGION || "auto",
    s3Bucket: required("S3_BUCKET"),
    s3AccessKeyId: required("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    uploadToken: required("UPLOAD_TOKEN"),
    signingSecret: required("SIGNING_SECRET"),
    accessPassword: process.env.ACCESS_PASSWORD || undefined,
  };
}

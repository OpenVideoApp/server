import aws = require("aws-sdk");
import * as path from "path";

const REGION = "us-east-1";
const ACCESS_KEY = process.env.AWS_ACCESS_KEY;
const SECRET_KEY = process.env.AWS_SECRET_KEY;

aws.config.update({
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  region: REGION
});

class S3Bucket {
  private s3: aws.S3;
  private bucket: string;

  constructor(bucket: string) {
    this.s3 = new aws.S3();
    this.bucket = bucket;
  }

  async upload(object: Buffer, folder: string, name: string): Promise<boolean> {
    try {
      let response = await this.s3.putObject({
        Bucket: this.bucket,
        Body: object,
        Key: path.join(folder, name),
        ACL: "public-read"
      }).promise();
      console.log(`Uploaded file '${name}' to folder '${folder}' with ETag ${response.ETag}`);
      return true;
    } catch (error) {
      console.error("Failed to upload to s3:", error);
      return false;
    }
  }
}

const bucket = new S3Bucket("openvideo-raw");
export default bucket;
import aws = require("aws-sdk");

const REGION = "ap-southeast-2";
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

  async upload(object: Buffer, name: string): Promise<boolean> {
    try {
      let response = await this.s3.putObject({
        Bucket: this.bucket,
        Body: object,
        Key: name,
        ACL: "public-read"
      }).promise();
      console.log(`Uploaded file '${name}' with ETag #${response.ETag}`);
      return true;
    } catch (error) {
      console.error("Failed to upload to s3:", error);
      return false;
    }
  }
}

const bucket = new S3Bucket("raw.openvideo.ml");
export default bucket;
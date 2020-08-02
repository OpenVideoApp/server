import aws = require("aws-sdk");
import * as path from "path";
import {isUuid} from "uuidv4";

const REGION = "us-east-1";
const ACCESS_KEY = process.env.AWS_ACCESS_KEY;
const SECRET_KEY = process.env.AWS_SECRET_KEY;

aws.config.update({
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  signatureVersion: "v4",
  region: REGION,
});

class S3Bucket {
  private s3: aws.S3;
  private readonly bucket: string;

  constructor(bucket: string, options: aws.S3.Types.ClientConfiguration = {}) {
    this.s3 = new aws.S3(options);
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

  async getUploadURL(name: string): Promise<string> {
    return this.s3.getSignedUrl("putObject", {
      Bucket: this.bucket,
      Key: "video/" + name + ".mp4",
      Expires: 10 * 60, // 30 minutes
      ContentType: "video/mp4"
    });
  }
}

class ElasticTranscoder {
  private transcoder: aws.ElasticTranscoder;

  constructor() {
    this.transcoder = new aws.ElasticTranscoder({
      apiVersion: '2012-09-25'
    });
  }

  async startTranscoding(id: string): Promise<boolean> {
    if (!isUuid(id)) {
      console.warn(`Tried to start transcoding with invalid uuid '${id}'!`);
      return false;
    }

    return this.transcoder.createJob({
      // OpenVideo Compression Pipeline
      PipelineId: "1595510695744-a75dx6",
      OutputKeyPrefix: `video/${id}/`,
      Input: {
        Key: `video/${id}.mp4`
      },
      Outputs: [
        {
          // 1080p Portrait 1024kb
          PresetId: "1595519577560-jis67i",
          Key: "compressed-1024kb.mp4",
          ThumbnailPattern: "prev-{count}",
          Rotate: "auto"
        }
      ]
    }).promise().then(() => {
      console.info(`Started transcoding video #${id}!`);
      return true;
    }).catch((error) => {
      console.warn(`Failed to start transcoding job with id #${id}:`, error);
      return false;
    });
  }
}

const mainBucket = new S3Bucket("openvideo-raw");

const uploadBucket = new S3Bucket("openvideo-upload", {
  endpoint: "openvideo-upload.s3-accelerate.amazonaws.com",
  region: "us-east-1",
  signatureVersion: "v4",
  useAccelerateEndpoint: true,
});

const transcoder = new ElasticTranscoder();

export {mainBucket, uploadBucket, transcoder};
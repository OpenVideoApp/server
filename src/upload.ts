import aws = require("aws-sdk");
import fs = require("fs");

const BUCKET = "open-video";
const REGION = "ap-southeast-2";
const ACCESS_KEY = process.env.AWS_ACCESS_KEY;
const SECRET_KEY = process.env.AWS_SECRET_KEY;

aws.config.update({
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  region: REGION
});

const s3 = new aws.S3();

function testUpload(): void {
  let localName = "./test/video.mp4";
  let remoteName = `video_${new Date().getTime()}.mp4`;

  s3.putObject({
    Bucket: BUCKET,
    Body: fs.readFileSync(localName),
    Key: remoteName
  }).promise().then((response: any) => {
    console.log("Uploaded video:", response);
    console.log(`URL: ${s3.getSignedUrl("getObject", {
      Bucket: BUCKET,
      Key: remoteName
    })}`);
  }).catch((err: any) => {
    console.error("Failed to upload video:", err);
  });
}
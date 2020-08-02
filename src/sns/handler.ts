import {validateMessage} from "./verification";
import db from "../api/db";

const FILENAME_PATTERN = /[ \w-]+?(?=\.)/;

const TRANSCODING_COMPLETE_ARN = "arn:aws:sns:us-east-1:534819052976:OpenVideoTranscodingComplete";
const UPLOAD_COMPLETE_ARN = "arn:aws:sns:us-east-1:534819052976:OpenVideoUploadComplete";

async function handleCompletedTranscoding(msg: any) {
  let videoId = msg.input.key.match(FILENAME_PATTERN);
  let outputPrefix = msg.outputKeyPrefix;
  let outputs = msg.outputs;

  if (outputs.length != 1) return console.warn("Multiple transcoding outputs are currently unsupported!");

  let output = outputs[0];
  let file = output.key;
  let thumbnail = output.thumbnailPattern.replace("{count}", "00001") + ".jpg";

  return db.handleCompletedTranscoding(videoId[0].toString(), outputPrefix, file, thumbnail);
}

async function handleUploadComplete(msg: any) {
  let record = msg.Records[0];
  let key = record.s3.object.key;
  let videoId = key.match(FILENAME_PATTERN);

  console.info(`Received notification for uploaded file '${key}'`);
  return db.handleCompletedUpload(videoId.toString());
}

async function handleNotification(req: any): Promise<String> {
  let body = JSON.parse(req.body);
  let valid = await validateMessage(body);
  let type = body.Type;

  if (!valid) {
    console.info("Received SNS message with an invalid signature!");
    return "Invalid Message Signature";
  } else if (type == "Notification") {
    let topic = body.TopicArn;
    let msg = "Message" in body ? JSON.parse(body.Message) : undefined;

    if (!topic || !msg) {
      console.warn("Received valid SNS notification with missing topic/msg:", body);
      return "Missing Data";
    }

    if (topic == TRANSCODING_COMPLETE_ARN) {
      await handleCompletedTranscoding(msg).catch((error) => {
        console.warn("Failed to handle completed transcoding:", error);
        return "Error";
      });
    } else if (topic == UPLOAD_COMPLETE_ARN) {
      await handleUploadComplete(msg).catch((error) => {
        console.warn("Failed to handle completed upload:", error);
        return "Error";
      });
    }
    else console.info("Received unknown SNS notification:", topic);
  } else if (type === "SubscriptionConfirmation" || type === "UnsubscribeConfirmation") {
    console.info("Received SNS subscription notification:", body);
  }

  return "Ok";
}

export {handleNotification}
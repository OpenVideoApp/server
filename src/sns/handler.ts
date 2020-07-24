import {validateMessage} from "./verification";
import db from "../api/db";

const FILENAME_PATTERN = /[ \w-]+?(?=\.)/;

async function handleCompletedTranscoding(msg: any) {
  console.info("Transcoding Complete:", msg, " Type: ", (typeof msg));

  let videoId = msg.input.key.match(FILENAME_PATTERN);
  let outputPrefix = msg.outputKeyPrefix;

  let outputs = msg.outputs;
  console.info("Outputs:", outputs);

  if (outputs.length != 1) return console.warn("Multiple transcoding outputs are currently unsupported!");

  let output = outputs[0];
  let file = output.key;

  return db.handleCompletedTranscoding(videoId[0], outputPrefix, file);
}

async function handleNotification(req: any): Promise<String> {
  let body = JSON.parse(req.body);
  let valid = await validateMessage(body);

  if (!valid) {
    console.info("Received SNS message with an invalid signature!");
    return "Invalid Message Signature";
  } else if (body.Type == "Notification") {
    let topic = body.TopicArn;
    let msg = "Message" in body ? JSON.parse(body.Message) : undefined;

    if (!topic || !msg) {
      console.warn("Received valid SNS notification with missing topic/msg:", body);
      return "Missing Data";
    }

    if (topic == "arn:aws:sns:us-east-1:534819052976:OpenVideoTranscodingComplete") {
      await handleCompletedTranscoding(msg).catch((error) => {
        console.warn("Failed to handle completed transcoding:", error);
        return "Error";
      })
    } else console.info("Received unknown SNS notification:", topic);
  }

  return "Ok";
}

export {handleNotification}
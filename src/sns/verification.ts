import crypto = require('crypto');
import requestretry = require('requestretry');
import LRU = require('lru-cache');

const CERT_URL_PATTERN = /^https:\/\/sns\.[a-zA-Z0-9-]{3,}\.amazonaws\.com(\.cn)?\/SimpleNotificationService-[a-zA-Z0-9]{32}\.pem$/;
const CERT_CACHE = new LRU({max: 5000, maxAge: 1000 * 60});

function getFieldsForSignature(type: string): string[] {
  if (type === "SubscriptionConfirmation" || type === "UnsubscribeConfirmation") {
    return ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  } else if (type === "Notification") {
    return ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"];
  } else return [];
}

async function fetchCert(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const cachedCert = CERT_CACHE.get(url);
    if (cachedCert != null) return resolve(cachedCert);
    requestretry({
      method: 'GET',
      url: url,
      maxAttempts: 3,
      retryDelay: 100,
      timeout: 3000
    }, (err, res, cert) => {
      if (err) return reject(err);
      if (res.statusCode == 200) {
        CERT_CACHE.set(url, cert);
        return resolve(cert);
      } else return reject(`Received unexpected status code ${res.statusCode} when fetching certificate`);
    });
  });
}

async function validateMessage(message: any): Promise<boolean> {
  let type = message.Type, version = message.SignatureVersion;
  let url = message.SigningCertURL, signature = message.Signature;

  if (!version || !url || !type || !signature) {
    console.warn("Tried to validate message with missing fields:", message);
    throw "Missing fields!";
  } else if (message.SignatureVersion !== "1") {
    console.warn(`Tried to validate message with invalid signature version '${version}'`);
    throw "Unsupported Signature Version";
  } else if (!CERT_URL_PATTERN.test(url)) {
    console.warn(`Tried to validate message with invalid signature URL '${url}'`);
    throw "Invalid Signing URL";
  }

  return fetchCert(url).then((cert) => {
    const verify = crypto.createVerify("sha1WithRSAEncryption");
    getFieldsForSignature(type).forEach((key) => {
      if (key in message) verify.write(`${key}\n${message[key]}\n`);
    });
    verify.end();
    return verify.verify(cert, signature, "base64");
  }).catch((error) => {
    console.warn("Failed to fetch certificate to verify message:", error);
    return false;
  });
}

export {validateMessage};
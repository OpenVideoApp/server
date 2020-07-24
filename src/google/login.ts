import {OAuth2Client, TokenPayload} from "google-auth-library";
import * as https from "https";

const CLIENT_ID = "859725405396-fn77ecqnl8bqn1p24ptktokqpv0us32o.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);

async function verifyGoogleLogin(idToken: string): Promise<TokenPayload> {
  // debug: check token against google testing server
  https.get(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    (res) => {
      console.info("Response: ", res);
      let str = '';

      res.on('data', function (chunk) {
        str += chunk;
      });

      res.on('end', function () {
        console.info("Full Response:", str);
      });
    }
  ).end();

  console.info("ah yes");

  const ticket = await client.verifyIdToken({
    idToken: idToken,
    audience: CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload) throw new Error("Invalid Token");

  return payload;
}

export {verifyGoogleLogin};
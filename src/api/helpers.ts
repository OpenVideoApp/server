import neo4j from "neo4j-driver";

export class APIResult {
  success: boolean;

  static Success = new APIResult(true);
  static Neutral = new APIResult(false);

  constructor(success: boolean) {
    this.success = success;
  }

  get __typename() {
    return "APIResult";
  }
}

export class APIError extends APIResult{
  error: string;

  static Internal = new APIError("Internal Error");
  static Authentication = new APIError("Authentication Failed");

  constructor(error: string) {
    super(false);
    this.error = error;
  }

  get __typename() {
    return "APIError";
  }
}

export function unixTime() {
  return Math.round((new Date()).getTime() / 1000);
}

const S3_URL = "https://raw.openvideo.ml";

export function processInternalURL(folder: string, url: string): string {
  if (url.includes(S3_URL)) return url;
  return S3_URL + "/" + folder + "/" + url;
}

export function getVarFromQuery(res: Record<string, any>, prop: string, field: string, fallback: any = undefined) {
  if (res["keys"].includes(prop + field)) return res.get(prop + field);
  else return fallback;
}

export function getIntFromQuery(res: Record<string, any>, prop: string, field: string) {
  if (res["keys"].includes(prop + field)) return neo4j.int(res.get(prop + field)).toInt();
  else return 0;
}

export function getNeo4JInt(value: any) {
  if (neo4j.isInt(value)) return neo4j.int(value).toInt();
  return value;
}
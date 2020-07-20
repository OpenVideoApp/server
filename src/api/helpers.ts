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
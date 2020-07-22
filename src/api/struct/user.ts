import {processInternalURL} from "../helpers";
import bucket from "../../aws";
import jdenticon from "jdenticon";
import neo4j from "neo4j-driver";

export class AuthData {
  valid: boolean;
  username?: string;

  constructor(valid: boolean, username?: string) {
    this.valid = valid;
    this.username = username;
  }

  static Invalid = new AuthData(false);
}

export class Login {
  since: number;
  token: string;
  device: string;
  user?: User;

  constructor(since: number, token: string, device: string, user: User) {
    this.since = since;
    this.token = token;
    this.device = device;
    this.user = user;
  }

  get __typename() {
    return "Login";
  }
}

export class User {
  name: string;
  createdAt?: number;
  passwordHash?: string;
  token?: string;
  displayName?: string;
  profilePicURL?: string;
  likes?: number;

  static MIN_USERNAME_LENGTH = 3;
  static MIN_PASSWORD_LENGTH = 8;

  constructor(user: User) {
    this.name = user.name;
    this.createdAt = user.createdAt;
    this.passwordHash = user.passwordHash;
    this.token = user.token;
    this.displayName = user.displayName;
    this.likes = user.likes || 0;
    if (user.profilePicURL) this.profilePicURL = processInternalURL(user.profilePicURL);
  }

  async generateIcon(): Promise<boolean> {
    let icon =  jdenticon.toPng(this.name, 200);
    this.profilePicURL = this.name + ".jpg";
    return bucket.upload(icon, this.profilePicURL);
  }

  static fromQuery(res: Record<string, any>, prop: string): User {
    let user = new User(res.get(prop).properties);
    if (res["keys"].includes(prop + "Likes")) user.likes = neo4j.int(res.get(prop + "Likes")).toInt();
    return user;
  }

  get __typename() {
    return "User";
  }
}
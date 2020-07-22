import {getIntFromQuery, getVarFromQuery, processInternalURL} from "../helpers";
import bucket from "../../aws";
import jdenticon from "jdenticon";

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
  following?: number;
  followers?: number;
  likes?: number;
  followsYou?: boolean;
  followedByYou?: boolean;

  static MIN_USERNAME_LENGTH = 3;
  static MIN_PASSWORD_LENGTH = 8;

  constructor(user: User) {
    this.name = user.name;
    this.createdAt = user.createdAt;
    this.passwordHash = user.passwordHash;
    this.token = user.token;
    this.displayName = user.displayName;
    this.following = user.following || 0;
    this.followers = user.followers || 0;
    this.likes = user.likes || 0;
    this.followsYou = user.followsYou || false;
    this.followedByYou = user.followedByYou || false;
    if (user.profilePicURL) this.profilePicURL = processInternalURL(user.profilePicURL);
  }

  async generateIcon(): Promise<boolean> {
    let icon =  jdenticon.toPng(this.name, 200);
    this.profilePicURL = this.name + ".jpg";
    return bucket.upload(icon, this.profilePicURL);
  }

  static fromQuery(res: Record<string, any>, prop: string): User {
    let user = new User(res.get(prop).properties);
    user.following = getIntFromQuery(res, prop, "Following");
    user.followers = getIntFromQuery(res, prop, "Followers");
    user.likes = getIntFromQuery(res, prop, "Likes");
    user.followsYou = getVarFromQuery(res, prop, "FollowsYou", false);
    user.followedByYou = getVarFromQuery(res, prop, "FollowedByYou", false);
    return user;
  }

  get __typename() {
    return "User";
  }
}
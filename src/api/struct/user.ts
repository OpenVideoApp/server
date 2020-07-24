import {getNeo4JInt, getVarFromQuery, processInternalURL} from "../helpers";
import {mainBucket} from "../../aws";
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
  profileBio?: string;
  profileLink?: string;
  profilePicURL?: string;
  following?: number;
  followers?: number;
  views?: number;
  likes?: number;
  followsYou?: boolean;
  followedByYou?: boolean;

  static MIN_USERNAME_LENGTH = 3;
  static MIN_PASSWORD_LENGTH = 8;

  constructor(user: User) {
    this.name = user.name;
    this.createdAt = getNeo4JInt(user.createdAt);
    this.passwordHash = user.passwordHash;
    this.token = user.token;
    this.displayName = user.displayName;
    this.profileBio = user.profileBio;
    this.profileLink = user.profileLink;
    this.following = getNeo4JInt(user.following) || 0;
    this.followers = getNeo4JInt(user.followers) || 0;
    this.views = getNeo4JInt(user.views) || 0;
    this.likes = getNeo4JInt(user.likes) || 0;
    this.followsYou = user.followsYou || false;
    this.followedByYou = user.followedByYou || false;
    if (user.profilePicURL) this.profilePicURL = processInternalURL("user", user.profilePicURL);
  }

  static async generateIcon(name: string): Promise<string | undefined> {
    let icon =  jdenticon.toPng(name, 200);
    let profilePicURL = name + ".jpg";
    return mainBucket.upload(icon, "user", profilePicURL).then((success) => {
      if (success) console.info(`Generated icon for user '${name}'!`);
      else console.info(`Failed to generate icon for user '${name}`);
      return profilePicURL;
    }).catch((error) => {
      console.warn(`Failed to generate icon for '${name}':`, error);
      return undefined;
    })
  }

  static fromQuery(res: Record<string, any>, prop: string): User {
    let user = new User(res.get(prop).properties);
    user.followsYou = getVarFromQuery(res, prop, "FollowsYou", false);
    user.followedByYou = getVarFromQuery(res, prop, "FollowedByYou", false);
    return user;
  }

  get __typename() {
    return "User";
  }
}
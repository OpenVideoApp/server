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

  constructor(user: User) {
    this.name = user.name;
    this.createdAt = user.createdAt;
    this.passwordHash = user.passwordHash;
    this.token = user.token;
    this.displayName = user.displayName;
    this.profilePicURL = user.profilePicURL;
  }

  static fromQuery(res: Record<string, any>, prop: string): User {
    return new User(res.get(prop).properties);
  }

  get __typename() {
    return "User";
  }
}
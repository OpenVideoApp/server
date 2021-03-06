import {User} from "./user";
import {getNeo4JInt} from "../helpers";

export class Sound {
  id: string;
  createdAt: number;
  user?: User;
  desc?: string;

  constructor(sound: Sound) {
    this.id = sound.id;
    this.createdAt = getNeo4JInt(sound.createdAt);
    this.desc = sound.desc;
    this.user = sound.user;
  }

  static fromQuery(res: Record<string, any>, prop: string): Sound {
    let sound = new Sound(res.get(prop).properties);
    sound.user = User.fromQuery(res, prop + "User");
    return sound;
  }

  get __typename() {
    return "Sound";
  }
}
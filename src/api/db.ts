import neo4j, {Driver, Session} from "neo4j-driver";
import {v4 as uuidv4} from "uuid";
import bcrypt = require("bcrypt");

import {APIError, APIResult, unixTime} from "./helpers";
import {AuthData, Login, User} from "./struct/user";
import {Sound} from "./struct/sound";
import {Video, VideoComment, WatchData} from "./struct/video";

class Database {
  driver: Driver;

  constructor(host?: string, user?: string, pass?: string) {
    this.driver = neo4j.driver(
      host || "bolt://localhost:8000",
      neo4j.auth.basic(user || 'neo4j',pass || "password"),
        {encrypted: true}
    );
    this.driver.verifyConnectivity().then((serverInfo) => {
      console.info(`Connected to database on '${serverInfo.address}' with version '${serverInfo.version}'`);
    }).catch((err) => {
      console.error("Failed to connect to database:", err);
    });
  }

  async createUser(name: string, password: string, displayName: string, profilePicURL: string): Promise<User | APIError> {
    let passwordHash = await bcrypt.hash(password, 10);
    let session = this.driver.session();

    try {
      let result = await session.run(`
        MATCH (user:User)
        WHERE user.name = $name
        RETURN user
      `, {
        name: name
      });

      if (result.records.length > 0) return new APIError("User already exists!");

      let user = new User({
        name: name,
        createdAt: unixTime(),
        passwordHash: passwordHash,
        displayName: displayName,
        profilePicURL: profilePicURL
      } as User);

      await session.run(`
        CREATE (a: User $user)
        RETURN a
      `, {
        user: user
      });
      await session.close();
      return user;
    } catch (error) {
      console.info("Error creating user:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async getUser(name: string, existingSession?: Session): Promise<User | APIError> {
    let session: Session = existingSession || this.driver.session();
    try {
      let result = await session.run(`
        MATCH (user:User)
        WHERE user.name = $name
        RETURN user
      `, {
        name: name
      });
      if (!existingSession) await session.close();
      if (result.records.length == 0) return new APIError("Missing User");
      return new User(result.records[0].get("user").properties);
    } catch (error) {
      console.info("Error getting user:", error);
      if (!existingSession) await session.close();
      return APIError.Internal;
    }
  }

  async login(username: string, password: string, device: string): Promise<Login | APIError> {
    let session = this.driver.session();
    let user = await this.getUser(username, session);
    if (user.__typename == "APIError") {
      await session.close();
      return new APIError("Invalid User");
    }

    user = user as User;

    let hash = user.passwordHash;
    if (!hash) return new APIError("Password Error");

    let validPassword = await bcrypt.compare(password, hash);
    if (!validPassword) return new APIError("Incorrect Password");

    let timestamp = unixTime();
    let token = uuidv4();

    user.passwordHash = undefined;

    try {
      let results = await session.run(`
        MATCH (user:User)
        WHERE user.name = $username
        CREATE (user)-[r:AUTHENTICATED_ON]->(login: Login $login)
        RETURN r
      `, {
        login: {
          since: timestamp,
          device: device,
          token: token
        },
        username: username
      });
      await session.close();
      if (results.records.length == 0) return new APIError("Database Error");
      return new Login(timestamp, token, device, user);
    } catch (error) {
      console.warn(`Failed to login as '${username}':`, error);
      await session.close();
      return APIError.Internal;
    }
  }

  async validateLogin(username: string, token: string): Promise<boolean> {
    let session = this.driver.session();
    try {
      let result = await session.run(`
        MATCH (user:User)-[l:AUTHENTICATED_ON]->(login:Login)
        WHERE user.name = $username AND login.token = $token
        RETURN user
      `, {
        username: username,
        token: token
      });
      await session.close();
      return result.records.length > 0;
    } catch (error) {
      console.info("Error checking token:", error);
      await session.close();
      return false;
    }
  }

  async createSound(auth: AuthData, desc: string): Promise<Sound | APIError> {
    if (!auth.valid) return APIError.Authentication;

    let sound = new Sound({
      id: uuidv4(),
      createdAt: unixTime(),
      desc: desc
    } as Sound);

    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (user: User)
        WHERE user.name = $username
        CREATE (user)-[r:RECORDED]->(sound: Sound $sound)
        RETURN user, sound
      `, {
        sound: sound,
        username: auth.username
      });
      await session.close();
      sound.user = query.records[0].get("user").properties;
      return sound;
    } catch (error) {
      console.info("Error creating sound:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async getSound(id: string): Promise<Sound | APIError> {
    let session = this.driver.session();
    try {
      let query = await session.run(`
        MATCH (sound: Sound)<-[r: RECORDED]-(user: User)
        WHERE sound.id = $soundId
        RETURN sound, r, user
      `, {
        soundId: id
      });
      await session.close();

      if (query.records.length == 0) return new APIError("Invalid Sound");
      let res = query.records[0];

      let sound = new Sound(res.get("sound").properties);
      sound.user = res.get("user").properties;

      return sound;
    } catch (error) {
      console.warn("Failed to get sound:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async createVideo(auth: AuthData, soundId: string, src: string, desc: string): Promise<Video | APIError> {
    if (!auth.valid) return APIError.Authentication;

    let session = this.driver.session();

    try {
      let sound = await this.getSound(soundId);
      if (sound.__typename == "APIError") return new APIError("Invalid Sound");

      let video = new Video({
        id: uuidv4(),
        createdAt: unixTime(),
        src: src,
        desc: desc
      } as Video);

      let query = await session.run(`
        MATCH (user: User), (sound: Sound)
        WHERE user.name = $username AND sound.id = $soundId
        CREATE (user)-[ur:FILMED]->(video: Video $video)
        CREATE (video)-[sr:USES]->(sound)
        RETURN video, user
      `, {
        video: video,
        username: auth.username,
        soundId: soundId
      });
      await session.close();
      video.sound = sound as Sound;
      video.user = query.records[0].get("user").properties;
      video.views = video.likes = video.comments = 0;
      return video;
    } catch (error) {
      console.info("Error creating video:", error);
      await session.close();
      return APIError.Internal;
    }
  }


  async getVideo(id: string): Promise<Video | APIError> {
    let session = this.driver.session();
    try {
      let query = await Database.queryVideo(session, "video", {videoId: id});
      await session.close();
      if (query.records.length == 0) return new APIError("Invalid Video");
      return Video.fromQuery(query.records[0], "video");
    } catch (error) {
      console.warn("Failed to get sound:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async watchVideo(auth: AuthData, videoId: string, seconds: number): Promise<WatchData | APIError> {
    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (user: User), (video: Video)
        WHERE user.name = $username AND video.id = $videoId
        MERGE (user)-[watch:WATCHED]->(video)
        ON MATCH SET watch.seconds = watch.seconds + $seconds
        ON CREATE SET watch.seconds = $seconds
        RETURN watch
      `, {
        username: auth.username,
        videoId: videoId,
        seconds: seconds
      });
      await session.close();

      if (query.records.length == 0) return new APIError("Invalid Video");
      let watch = query.records[0].get("watch");
      return new WatchData(watch.properties.seconds);
    } catch (error) {
      console.warn("Failed to add watch to video:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async likeVideo(auth: AuthData, videoId: string, remove: boolean = false): Promise<APIResult> {
    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (user: User)${remove ? `-[like: LIKED]->` : ", "}(video: Video)
        WHERE user.name = $username AND video.id = $videoId
        ${remove ? `
          DETACH DELETE like
          RETURN video.id
        ` : `
          MERGE (user)-[like: LIKED]->(video)
          SET like.at = timestamp()
          RETURN like
        `}
      `, {
        username: auth.username,
        videoId: videoId
      });
      await session.close();
      return query.records.length == 0 ? APIResult.Neutral : APIResult.Success;
    } catch (error) {
      console.warn("Failed to like video:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async addComment(auth: AuthData, videoId: string, body: string): Promise<VideoComment | APIError> {
    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let query = await Database.queryVideo(session, "commentVideo", {
        comment: {
          id: uuidv4(),
          createdAt: unixTime(),
          body: body
        },
        username: auth.username,
        commentVideoId: videoId
      }, [
        "MATCH (commentUser: User),",
        "WHERE commentUser.name = $username AND commentVideo.id = $commentVideoId",
        `CREATE (commentUser)-[r:COMMENTED]->(comment: Comment $comment)-[on: ON]->(commentVideo)
        WITH comment, commentUser,`,
        "OPTIONAL MATCH",
        "RETURN comment, commentUser,"
      ]);
      await session.close();

      if (query.records.length == 0) return new APIError("Invalid Video");
      return VideoComment.fromQuery(query.records[0], "comment");
    } catch (error) {
      console.warn("Failed to add comment:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async getComment(id: string): Promise<VideoComment | APIError> {
    let session = this.driver.session();
    try {
      let query = await Database.queryVideo(session, "commentVideo", {
        commentId: id
      }, [
        `MATCH (commentUser: User)-[:COMMENTED]->(comment: Comment)-[:ON]->(commentVideo)
        WHERE comment.id = $commentId
        MATCH`, "",
        "WITH comment, commentUser,",
        "OPTIONAL MATCH",
        "RETURN comment, commentUser,"
      ]);
      await session.close();

      if (query.records.length == 0) return new APIError("Invalid Video");
      return VideoComment.fromQuery(query.records[0], "comment");
    } catch (error) {
      console.warn("Failed to get comment:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  private static async queryVideo(session: Session, name: string, props: any, query: string[] = [], matchVideoId = true) {
    return session.run(`
      ${query.length > 0 ? query[0] : "MATCH"} (${name}SoundUser: User)-[:RECORDED]->(${name}Sound: Sound)<-[:USES]-(${name}${matchVideoId ? ": Video": ""}),
      (${name})<-[:FILMED]-(${name}User: User)
      ${query.length > 1 ? query[1] : `WHERE ${name}.id = $${name}Id`}
      ${query.length > 2 ? query[2] : "WITH"} ${name}, ${name}User, ${name}Sound, ${name}SoundUser
      ${query.length > 3 ? query[3] : "OPTIONAL MATCH"} (${name})<-[${name}Watch: WATCHED]-(:User), 
      (${name})<-[${name}Like: LIKED]-(:User), (${name})<-[${name}Comment: ON]-(:Comment)
      ${query.length > 4 ? query[4] : "RETURN"} ${name}, ${name}User, ${name}Sound, ${name}SoundUser, 
      COUNT(DISTINCT ${name}Watch) AS ${name}Views, COUNT(DISTINCT ${name}Like) AS ${name}Likes,
      COUNT(DISTINCT ${name}Comment) AS ${name}Comments
    `, props);
  }
}

const db = new Database(
  process.env.NEO_HOST,
  process.env.NEO_USER,
  process.env.NEO_PASS
);

export default db;
import neo4j, {Driver, Session} from "neo4j-driver";
import {isUuid, uuid} from "uuidv4";
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
        neo4j.auth.basic(user || 'neo4j', pass || "password"),
        {encrypted: false}
    );
    this.driver.verifyConnectivity().then((serverInfo) => {
      console.info(`Connected to database on '${serverInfo.address}' with version '${serverInfo.version}'`);
    }).catch((err) => {
      console.error("Failed to connect to database:", err);
    });
  }

  async createUser(name: string, password: string, displayName: string, profilePicURL: string): Promise<User | APIError> {
    if (name.length < User.MIN_USERNAME_LENGTH) {
      return new APIError(`Username must be at least ${User.MIN_USERNAME_LENGTH} characters`);
    } else if (password.length < User.MIN_PASSWORD_LENGTH) {
      return new APIError(`Password must be at least ${User.MIN_PASSWORD_LENGTH} characters`);
    }

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
      let passwordHash = await bcrypt.hash(password, 10);

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
    if (name.length < User.MIN_USERNAME_LENGTH) return new APIError("Invalid Username");
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
    if (username.length < User.MIN_USERNAME_LENGTH) return new APIError("Invalid Username");
    if (password.length < User.MIN_PASSWORD_LENGTH) return new APIError("Invalid Password");

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
    let token = uuid();

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
    if (username.length < User.MIN_USERNAME_LENGTH || !isUuid(token)) return false;
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
      id: uuid(),
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
    if (!isUuid(id)) return new APIError("Invalid Sound ID");
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
    if (src.length < 1) return new APIError("Invalid Video");
    if (!isUuid(soundId)) return new APIError("Invalid Sound ID");

    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let sound = await this.getSound(soundId);
      if (sound.__typename == "APIError") return new APIError("Invalid Sound");

      let video = new Video({
        id: uuid(),
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


  async getVideo(auth: AuthData, id: string): Promise<Video | APIError> {
    if (!isUuid(id)) return new APIError("Invalid Video ID");
    let session = this.driver.session();

    try {
      let query = await Database.queryVideo(session, "video", {
        videoId: id,
        authenticatedUser: auth.valid ? auth.username : null
      });
      await session.close();
      if (query.records.length == 0) return new APIError("Invalid Video");
      return Video.fromQuery(query.records[0], "video");
    } catch (error) {
      console.warn("Failed to get sound:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async getVideos(auth: AuthData, count: number): Promise<Video[]> {
    if (count < 1) return [];
    if (!auth.valid) return [];
    let session = this.driver.session();

    try {
      let query = await Database.queryVideo(session, "video", {
        authenticatedUser: auth.username,
        count: count
      }, [
        "MATCH", "", "WITH", "OPTIONAL MATCH", "RETURN",
        "ORDER BY rand() LIMIT $count"
      ]);

      if (query.records.length == 0) return [];

      let videos: Video[] = [];
      for (let v = 0; v < query.records.length; v++) {
        videos.push(Video.fromQuery(query.records[v], "video"));
      }

      return videos;
    } catch (error) {
      console.warn("Failed to get videos:", error);
      return [];
    }
  }

  async watchVideo(auth: AuthData, videoId: string, seconds: number): Promise<WatchData | APIError> {
    if (!isUuid(videoId)) return new APIError("Invalid Video ID");
    if (seconds < 0) return new APIError("Seconds must be positive");

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
    if (!isUuid(videoId)) return new APIError("Invalid Video ID");

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
    if (!isUuid(videoId)) return new APIError("Invalid Video ID");
    if (body.length < 1) return new APIError("Comment cannot be empty");

    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let query = await Database.queryVideo(session, "commentVideo", {
        comment: {
          id: uuid(),
          createdAt: unixTime(),
          body: body
        },
        authenticatedUser: auth.username,
        commentVideoId: videoId
      }, [
        "MATCH (commentUser: User),",
        "WHERE commentUser.name = $authenticatedUser AND commentVideo.id = $commentVideoId",
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

  // TODO: deduplication with likeVideo ?
  async likeComment(auth: AuthData, commentId: string, remove: boolean = false) {
    if (!isUuid(commentId)) return new APIError("Invalid Comment ID");

    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (user: User)${remove ? `-[like: LIKED]->` : ", "}(comment: Comment)
        WHERE user.name = $username AND comment.id = $commentId
        ${remove ? `
          DETACH DELETE like
          RETURN comment.id
        ` : `
          MERGE (user)-[like: LIKED]->(comment)
          SET like.at = timestamp()
          RETURN like
        `}
      `, {
        username: auth.username,
        commentId: commentId
      });
      await session.close();
      return query.records.length == 0 ? APIResult.Neutral : APIResult.Success;
    } catch (error) {
      console.warn("Failed to like comment:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  // TODO: deduplication between getComments
  async getComment(auth: AuthData, id: string): Promise<VideoComment | APIError> {
    if (!isUuid(id)) return new APIError("Invalid Comment ID");
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (commentUser: User)-[:COMMENTED]->(comment: Comment)
        WHERE comment.id = $commentId
        OPTIONAL MATCH (likeUser: User)-[:LIKED]->(comment)
        RETURN comment, commentUser, COUNT(DISTINCT likeUser) AS commentLikes${auth.valid ? `,
        EXISTS((:User {name: $authenticatedUser})-[:LIKED]->(comment)) AS commentLiked` : ""}
      `, {
        commentId: id,
        authenticatedUser: auth.valid ? auth.username : null
      });
      await session.close();

      if (query.records.length == 0) return new APIError("Invalid Comment");
      return VideoComment.fromQuery(query.records[0], "comment");
    } catch (error) {
      console.warn("Failed to get comment:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  // TODO: get more than 10 comments
  async getComments(auth: AuthData, videoId: string): Promise<VideoComment[]> {
    if (!isUuid(videoId)) return [];
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (commentUser: User)-[:COMMENTED]->(comment: Comment)-[:ON]->(video: Video)
        WHERE video.id = $videoId
        OPTIONAL MATCH (likeUser: User)-[:LIKED]->(comment)
        RETURN comment, commentUser, COUNT(DISTINCT likeUser) AS commentLikes${auth.valid ? `,
        EXISTS((:User {name: $authenticatedUser})-[:LIKED]->(comment)) AS commentLiked` : ""}
        LIMIT 10
      `, {
        videoId: videoId,
        authenticatedUser: auth.valid ? auth.username : null
      });

      if (query.records.length == 0) return [];

      let comments: VideoComment[] = [];
      for (let comment = 0; comment < query.records.length; comment++) {
        comments.push(VideoComment.fromQuery(query.records[comment], "comment"));
      }

      return comments;
    } catch (error) {
      console.warn("Failed to get comments:", error);
      await session.close();
      return [];
    }
  }

  private static async queryVideo(session: Session, name: string, props: any, query: string[] = [], matchVideoId = true) {
    return session.run( `
      ${query.length > 0 ? query[0] : "MATCH"} (${name}SoundUser: User)-[:RECORDED]->(${name}Sound: Sound)<-[:USES]-(${name}${matchVideoId ? ": Video" : ""}),
      (${name})<-[:FILMED]-(${name}User: User)
      ${query.length > 1 ? query[1] : `WHERE ${name}.id = $${name}Id`}
      ${query.length > 2 ? query[2] : "WITH"} ${name}, ${name}User, ${name}Sound, ${name}SoundUser
      ${query.length > 3 ? query[3] : "OPTIONAL MATCH"} (${name})<-[${name}Watch: WATCHED]-(:User), 
      (${name})<-[${name}Like: LIKED]-(:User), (${name})<-[${name}Comment: ON]-(:Comment)
      ${query.length > 4 ? query[4] : "RETURN"} ${name}, ${name}User, ${name}Sound, ${name}SoundUser, 
      COUNT(DISTINCT ${name}Watch) AS ${name}Views, COUNT(DISTINCT ${name}Like) AS ${name}Likes,
      COUNT(DISTINCT ${name}Comment) AS ${name}Comments ${props.authenticatedUser ? `,
      EXISTS((:User {name: $authenticatedUser})-[:LIKED]->(${name})) AS ${name}Liked` : ""}
      ${query.length > 5 ? query[5] : ""}
    `, props);
  }
}

const db = new Database(
    process.env.NEO_HOST,
    process.env.NEO_USER,
    process.env.NEO_PASS
);

export default db;
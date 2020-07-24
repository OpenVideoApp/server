import neo4j, {Driver, Session} from "neo4j-driver";
import {isUuid, uuid} from "uuidv4";
import bcrypt = require("bcrypt");

import {transcoder, uploadBucket} from "../aws";
import {APIError, APIResult, processInternalURL, unixTime} from "./helpers";
import {AuthData, Login, User} from "./struct/user";
import {Sound} from "./struct/sound";
import {Video, VideoComment, WatchData} from "./struct/video";
import {UploadableVideo, VideoBuilderStatus} from "./struct/upload";

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

  async createUser(name: string, password: string, displayName: string): Promise<User | APIError> {
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

      let profilePicURL = await User.generateIcon(name);
      if (!profilePicURL) console.warn(`Failed to generate icon for user '${name}'`);

      let query = await session.run(`
        CREATE (user:User {
          name: $name,
          createdAt: timestamp(),
          passwordHash: $passwordHash,
          displayName: $displayName,
          profileBio: "", profileLink: "",
          profilePicURL: $profilePicURL,
          views: 0, likes: 0,
          following: 0, followers: 0
        })
        RETURN user
      `, {
        name: name,
        passwordHash: passwordHash,
        displayName: displayName,
        profilePicURL: profilePicURL
      });
      await session.close();
      return User.fromQuery(query.records[0], "user");
    } catch (error) {
      console.info("Error creating user:", error);
      await session.close();
      return APIError.Internal;
    }
  }

  async getUser(auth: AuthData, name: string, existingSession?: Session): Promise<User | APIError> {
    if (name.length < User.MIN_USERNAME_LENGTH) return new APIError("Invalid Username");
    let session: Session = existingSession || this.driver.session();
    try {
      let result = await session.run(`
        MATCH (user:User) WHERE user.name = $name
        ${auth.valid ? "MATCH (me:User) WHERE me.name = $authenticatedUser" : ""}
        RETURN user${auth.valid ? `,
          EXISTS((me)-[:FOLLOWS]->(user)) AS userFollowedByYou,
          EXISTS((user)-[:FOLLOWS]->(me)) AS userFollowsYou
        ` : ""}
      `, {
        name: name,
        authenticatedUser: auth.valid ? auth.username : undefined
      });
      if (!existingSession) await session.close();
      if (result.records.length == 0) return new APIError("Missing User");
      return User.fromQuery(result.records[0], "user");
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
    let user = await this.getUser(AuthData.Invalid, username, session);

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

  async followUser(auth: AuthData, username: string, remove: boolean): Promise<APIResult> {
    if (!auth.valid) return APIError.Authentication;
    if (username.length < User.MIN_USERNAME_LENGTH) return new APIError("Invalid Username");
    if (username == auth.username) return new APIError(`You can't ${remove ? "un" : ""}follow yourself!`);

    let session = this.driver.session();
    try {
      let queryStr;
      if (remove) queryStr = `
        MATCH (me:User {name: $authenticatedUser})-[f:FOLLOWS]->(them:User {name: $username})
        SET me.following = me.following - 1, them.followers = them.followers - 1
        DETACH DELETE f
        RETURN me.following, them.followers;
      `; else queryStr = `
        MATCH (me:User {name: $authenticatedUser}), (them:User {name: $username})
        MERGE (me)-[f:FOLLOWS]->(them)
        ON CREATE SET f.since = timestamp(), me.following = me.following + 1, them.followers = them.followers + 1
        RETURN f;
      `;
      let query = await session.run(queryStr, {
        "authenticatedUser": auth.username,
        "username": username
      });
      if (query.records.length == 0) {
        if (remove) return APIError.Neutral;
        else return new APIError("User does not exist");
      }
      await session.close();
      return APIResult.Success;
    } catch (error) {
      console.warn(`Failed to follow '${username}':`, error);
      await session.close();
      return APIError.Internal;
    }
  }

  async getUserList(auth: AuthData, username: string, followers: boolean = false): Promise<User[]> {
    if (username.length < User.MIN_USERNAME_LENGTH) return [];
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (them:User)${followers ? "-" : "<-"}[:FOLLOWS]${followers ? "->" : "-"}(:User {name: $username})
        ${auth.valid ? "MATCH (me: User {name: $authenticatedUser})" : ""}
        RETURN them AS user${auth.valid ? `,
          EXISTS((them)-[:FOLLOWS]->(me)) AS userFollowsYou,
          EXISTS((me)-[:FOLLOWS]->(them)) AS userFollowedByYou
        ` : ""}
      `, {
        "authenticatedUser": auth.valid ? auth.username : undefined,
        "username": username
      });

      let users: User[] = [];
      for (let u = 0; u < query.records.length; u++) {
        users.push(User.fromQuery(query.records[u], "user"));
      }
      return users;
    } catch (error) {
      console.warn(`Failed to get user list for '${username}':`, error);
      return [];
    }
  }

  async createSound(auth: AuthData, desc: string): Promise<Sound | APIError> {
    if (!auth.valid) return APIError.Authentication;

    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (soundUser: User)
        WHERE soundUser.name = $username
        CREATE (soundUser)-[r:RECORDED]->(sound: Sound {
          id: $id,
          createdAt: timestamp(),
          desc: $desc
        })
        RETURN sound, soundUser
      `, {
        id: uuid(),
        desc: desc,
        username: auth.username
      });
      await session.close();
      return Sound.fromQuery(query.records[0], "sound");
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

  async createVideo(auth: AuthData, soundId: string, desc: string): Promise<Video | APIError> {
    if (!isUuid(soundId)) return new APIError("Invalid Sound ID");

    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let sound = await this.getSound(soundId);
      if (sound.__typename == "APIError") return new APIError("Invalid Sound");

      let query = await session.run(`
        MATCH (videoUser:User), (videoSound:Sound)<-[:RECORDED]-(videoSoundUser:User)
        WHERE videoUser.name = $username AND videoSound.id = $soundId
        CREATE (videoUser)-[:FILMED]->(video: Video {
          id: $id,
          createdAt: timestamp(),
          desc: $desc,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0
        })-[sr:USES]->(videoSound)
        RETURN video, videoUser, videoSound, videoSoundUser
      `, {
        id: uuid(),
        desc: desc,
        username: auth.username,
        soundId: soundId
      });
      await session.close();
      return Video.fromQuery(query.records[0], "video");
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
      },"ORDER BY rand() LIMIT $count", false);

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

  async requestVideoUpload(auth: AuthData): Promise<UploadableVideo | APIError> {
    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();
    let id = uuid();

    try {
      let query = await session.run(`
        MATCH (user:User)-[:INITIATED]->(upload:VideoBuilder)
        WHERE user.name = $authenticatedUser
        OPTIONAL MATCH (user)-[:INITIATED]->(oldUpload:VideoBuilder)
        WHERE timestamp() - oldUpload.startedAt > 60000 * 30
        DETACH DELETE oldUpload
        RETURN COUNT(DISTINCT upload) AS builders
      `, {
        authenticatedUser: auth.username
      });

      let builders = neo4j.int(query.records[0].get("builders")).toInt();
      if (builders > 3) {
        await session.close();
        return new APIError("Too many concurrent uploads!");
      }

      query = await session.run(`
        MATCH (user:User)
        WHERE user.name = $authenticatedUser
        CREATE (user)-[:INITIATED]->(builder:VideoBuilder {
          id: $id,
          startedAt: timestamp(),
          status: ${VideoBuilderStatus.INITIATED}
        })
        RETURN builder
      `, {
        authenticatedUser: auth.username,
        id: id
      });

      await session.close();
      if (query.records.length == 0) return APIError.Internal;

      let url = await uploadBucket.getUploadURL(id);

      return new UploadableVideo(id, url, VideoBuilderStatus.INITIATED);
    } catch (error) {
      await session.close();
      console.warn("Failed to handle video upload request:", error);
      return APIError.Internal;
    }
  }

  async handleCompletedVideoUpload(auth: AuthData, videoId: string): Promise<APIResult> {
    if (!auth.valid) return APIError.Authentication;
    if (!isUuid(videoId)) return new APIError("Invalid Video ID");
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (user:User)-[:INITIATED]->(builder:VideoBuilder)
        WHERE user.name = $authenticatedUser AND builder.id = $videoId 
        AND builder.status = ${VideoBuilderStatus.INITIATED}
        SET builder.status = ${VideoBuilderStatus.UPLOADED}
        RETURN builder;
      `, {
        "authenticatedUser": auth.username,
        "videoId": videoId
      });

      if (query.records.length == 0) return new APIError("Invalid Video ID");
      await session.close();

      let success = await transcoder.startTranscoding(videoId);
      return success ? APIResult.Success : APIError.Internal;
    } catch (error) {
      await session.close();
      console.warn("Failed to mark VideoBuilder as uploaded:", error);
      return APIError.Internal;
    }
  }

  async handleCompletedTranscoding(videoId: string, folder: string, file: string) {
    if (!isUuid(videoId)) {
      console.warn(`Tried to handle completed transcoding with invalid video ID #${videoId}`);
      return false;
    }

    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (builder:VideoBuilder)
        WHERE builder.id = $videoId 
        AND builder.status = ${VideoBuilderStatus.UPLOADED}
        SET builder.status = ${VideoBuilderStatus.TRANSCODED}
        RETURN builder;
      `, {
        "videoId": videoId
      });

      await session.close();

      if (query.records.length == 0) {
        console.warn(`Tried to handle transcoding for invalid video ID #${videoId}`);
        return false;
      }

      console.info(`Finished transcoding video #${videoId} to ${processInternalURL(folder, file)}`);
      return true;
    } catch (error) {
      console.warn("Failed to mark VideoBuiilder transcoding as complete:", error);
      return false;
    }
  }

  async watchVideo(auth: AuthData, videoId: string, seconds: number): Promise<WatchData | APIError> {
    if (!isUuid(videoId)) return new APIError("Invalid Video ID");
    if (seconds < 0) return new APIError("Seconds must be positive");

    if (!auth.valid) return APIError.Authentication;
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (user:User), (video:Video)<-[:FILMED]-(videoUser:User)
        WHERE user.name = $username AND video.id = $videoId
        MERGE (user)-[watch:WATCHED]->(video)
        ON MATCH SET watch.seconds = watch.seconds + $seconds
        ON CREATE SET watch.seconds = $seconds,
        video.views = video.views + 1,
        videoUser.views = videoUser.views + 1
        RETURN watch, video.views
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
        MATCH (user:User)${remove ? `-[like:LIKED]->` : ", "}(video:Video)<-[:FILMED]-(videoUser:User)
        WHERE user.name = $username AND video.id = $videoId
        ${remove ? `
          DETACH DELETE like
          SET video.likes = video.likes - 1,
          videoUser.likes = videoUser.likes - 1
          RETURN video.likes
        ` : `
          MERGE (user)-[like: LIKED]->(video)
          ON CREATE SET video.likes = video.likes + 1,
          videoUser.likes = videoUser.likes + 1
          SET like.at = timestamp()
          RETURN like, video.likes
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
      let query = await session.run(`
        MATCH (commentUser:User), (commentVideo:Video)
        WHERE commentUser.name = $authenticatedUser AND commentVideo.id = $commentVideoId
        CREATE (commentUser)-[:COMMENTED]->(comment: Comment {
          id: $id,
          createdAt: timestamp(),
          body: $body,
          likes: 0
        })-[:ON]->(commentVideo)
        SET commentVideo.comments = commentVideo.comments + 1
        RETURN comment, commentUser
      `, {
        id: uuid(),
        body: body,
        authenticatedUser: auth.username,
        commentVideoId: videoId
      });
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
        MATCH (user: User)${remove ? `-[like:LIKED]->` : ", "}(comment: Comment),
        (commentUser:User)-[:COMMENTED]->(comment)
        WHERE user.name = $username AND comment.id = $commentId
        ${remove ? `
          DETACH DELETE like
          SET comment.likes = comment.likes - 1, 
          commentUser.likes = commentUser.likes - 1
          RETURN comment.id
        ` : `
          MERGE (user)-[like: LIKED]->(comment)
          ON CREATE SET comment.likes = comment.likes + 1, 
          commentUser.likes = commentUser.likes + 1
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
        RETURN comment, commentUser${auth.valid ? `,
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

  // TODO: get comments with pagination
  async getComments(auth: AuthData, videoId: string): Promise<VideoComment[]> {
    if (!isUuid(videoId)) return [];
    let session = this.driver.session();

    try {
      let query = await session.run(`
        MATCH (commentUser: User)-[:COMMENTED]->(comment: Comment)-[:ON]->(video: Video)
        WHERE video.id = $videoId
        RETURN comment, commentUser
        ${auth.valid ? `,EXISTS((:User {name: $authenticatedUser})-[:LIKED]->(comment)) AS commentLiked` : ""}
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

  private static async queryVideo(session: Session, name: string, props: any, append: string = "", matchId: boolean = true) {
    return session.run(`
      MATCH (${name}User: User)-[:FILMED]->(${name}: Video),
      (${name})-[:USES]->(${name}Sound: Sound)<-[:RECORDED]-(${name}SoundUser: User)
      ${matchId ? `WHERE ${name}.id = $${name}Id` : ""}
      RETURN ${name}, ${name}User, ${name}Sound, ${name}SoundUser${props.authenticatedUser ? `,
        EXISTS((:User {name: $authenticatedUser})-[:LIKED]->(${name})) AS ${name}Liked
      ` : ""}${append}
    `, props);
  }
}

const db = new Database(
    process.env.NEO_HOST,
    process.env.NEO_USER,
    process.env.NEO_PASS
);

export default db;
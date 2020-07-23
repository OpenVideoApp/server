import {User} from "./user";
import {Sound} from "./sound";
import {getNeo4JInt, getVarFromQuery, processInternalURL} from "../helpers";

export class Video {
  id: string;
  createdAt: number;
  src: string;
  desc: string;
  views: number;
  likes: number;
  shares?: number;
  comments: number;
  liked?: boolean;
  user?: User;
  sound?: Sound;

  constructor(video: Video) {
    this.id = video.id;
    this.createdAt = getNeo4JInt(video.createdAt);
    this.src = processInternalURL("video", video.id + ".mp4");
    this.desc = video.desc;
    this.views = video.views || 0;
    this.likes = video.likes || 0;
    this.shares = video.shares || 0;
    this.comments = video.comments || 0;
    this.liked = video.liked || false;
    this.user = video.user;
    this.sound = video.sound;
  }

  static fromQuery(res: Record<string, any>, prop: string): Video {
    let video = new Video(res.get(prop).properties);
    video.views = getNeo4JInt(video.views);
    video.likes = getNeo4JInt(video.likes);
    video.comments = getNeo4JInt(video.comments);
    video.user = User.fromQuery(res, prop + "User");
    video.sound = Sound.fromQuery(res, prop + "Sound");
    video.liked = getVarFromQuery(res, prop, "Liked", false);
    return video;
  }

  get __typename() {
    return "Video";
  }
}

export class WatchData {
  seconds?: number;

  constructor(seconds: number) {
    this.seconds = seconds;
  }

  get __typename() {
    return "WatchData";
  }
}

export class VideoComment {
  id: string;
  createdAt: number;
  body: string;
  likes: number;
  user?: User;
  liked?: boolean;

  constructor(comment: VideoComment) {
    this.id = comment.id;
    this.createdAt = getNeo4JInt(comment.createdAt);
    this.body = comment.body;
    this.likes = getNeo4JInt(comment.likes) || 0;
    this.user = comment.user;
    this.liked = comment.liked || false;
  }

  static fromQuery(res: Record<string, any>, prop: string): VideoComment {
    let comment = new VideoComment(res.get(prop).properties);
    comment.user = User.fromQuery(res, prop + "User");
    comment.liked = getVarFromQuery(res, prop, "Liked", false);
    return comment;
  }

  get __typename() {
    return "Comment";
  }
}
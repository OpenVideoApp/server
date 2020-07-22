import {User} from "./user";
import {Sound} from "./sound";
import {getIntFromQuery, getVarFromQuery, processInternalURL} from "../helpers";

export class Video {
  id: string;
  createdAt: number;
  src: string;
  desc: string;
  views: number;
  likes: number;
  shares?: number;
  comments: number;
  liked: boolean;
  user?: User;
  sound?: Sound;

  constructor(video: Video) {
    this.id = video.id;
    this.createdAt = video.createdAt;
    this.src = processInternalURL(video.src);
    this.desc = video.desc;
    this.views = video.views;
    this.likes = video.likes;
    this.shares = video.shares;
    this.comments = video.comments;
    this.liked = video.liked || false;
    this.user = video.user;
    this.sound = video.sound;
  }

  static fromQuery(res: Record<string, any>, prop: string): Video {
    let video = new Video(res.get(prop).properties);
    video.user = User.fromQuery(res, prop + "User");
    video.sound = Sound.fromQuery(res, prop + "Sound");
    video.views = getIntFromQuery(res, prop, "Views");
    video.likes = getIntFromQuery(res, prop, "Likes");
    video.comments = getIntFromQuery(res, prop, "Comments");
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
  liked: boolean;

  constructor(comment: VideoComment) {
    this.id = comment.id;
    this.createdAt = comment.createdAt;
    this.body = comment.body;
    this.likes = comment.likes;
    this.user = comment.user;
    this.liked = comment.liked || false;
  }

  static fromQuery(res: Record<string, any>, prop: string): VideoComment {
    let comment = new VideoComment(res.get(prop).properties);
    comment.user = User.fromQuery(res, prop + "User");
    comment.likes = getIntFromQuery(res, prop, "Likes");
    comment.liked = getVarFromQuery(res, prop, "Liked", false);
    return comment;
  }

  get __typename() {
    return "Comment";
  }
}
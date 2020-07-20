import {User} from "./user";
import {Sound} from "./sound";
import neo4j from "neo4j-driver";

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
    this.createdAt = video.createdAt;
    this.src = video.src;
    this.desc = video.desc;
    this.views = video.views;
    this.likes = video.likes;
    this.shares = video.shares;
    this.comments = video.comments;
    this.liked = video.liked;
    this.user = video.user;
    this.sound = video.sound;
  }

  static fromQuery(res: Record<string, any>, prop: string): Video {
    let video = new Video(res.get(prop).properties);
    video.user = User.fromQuery(res, prop + "User");
    video.sound = Sound.fromQuery(res, prop + "Sound");
    video.views = neo4j.int(res.get(prop + "Views")).toInt();
    video.likes = neo4j.int(res.get(prop + "Likes")).toInt();
    video.comments = neo4j.int(res.get(prop + "Comments")).toInt();
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
  user?: User;
  video?: Video;

  constructor(comment: VideoComment) {
    this.id = comment.id;
    this.createdAt = comment.createdAt;
    this.body = comment.body;
    this.user = comment.user;
    this.video = comment.video;
  }

  static fromQuery(res: Record<string, any>, prop: string): VideoComment {
    let comment = new VideoComment(res.get(prop).properties);
    comment.video = Video.fromQuery(res, prop + "Video");
    comment.user = User.fromQuery(res, prop + "User");
    return comment;
  }

  get __typename() {
    return "Comment";
  }
}
/*
export const VIDEOS: Video[] = [
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/cah-ad.mp4",
    desc: "I made this site so that you can play #cardsagainsthumanity despite being in #quarantine! Link in bio.",
    likes: 168302,
    comments: 3048,
    shares: 34931,
    liked: false,
    user: USERS["raphydaphy"],
    sound: new Sound({
      desc: "cards against quarantine",
      user: USERS["raphydaphy"]
    })
  }),
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/dorime.mp4",
    desc: "It haunts my #dreams",
    likes: 2843967,
    comments: 28483,
    shares: 43812,
    liked: false,
    user: USERS["mariob0y"],
    sound: new Sound({
      desc: "dorimeee (spooky)",
      user: USERS["raphydaphy"]
    })
  }),
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/mario_piano.mp4",
    desc: "My #piano cover of #mario - #gaming #toptalent",
    likes: 99381,
    comments: 48313,
    shares: 13843,
    liked: false,
    user: USERS["mariob0y"],
    sound: new Sound({
      desc: "mario piano cover",
      user: USERS["mariob0y"],
    })
  }),
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/portland.mp4",
    desc: "Thought this might be a bit cute... #lgbt #portland #guitar",
    likes: 2593381,
    comments: 14399,
    shares: 9931,
    liked: false,
    user: USERS["j3ss!ca"],
    sound: new Sound({
      desc: "she said to me (portland)",
      user: USERS["j3ss!ca"]
    })
  })
];
*/
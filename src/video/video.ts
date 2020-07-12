export class Sound {
  desc: string;

  constructor(sound: {desc: string}) {
    this.desc = sound.desc;
  }
}

export class Video {
  src: string;
  desc: string;
  sound: Sound;
  likes: number;
  shares: number;
  comments: number;
  liked: boolean;

  constructor(video: {src: string, desc: string, sound: Sound, likes: number, shares: number, comments: number, liked: boolean}) {
    this.src = video.src;
    this.desc = video.desc;
    this.sound = video.sound;
    this.likes = video.likes;
    this.shares = video.shares;
    this.comments = video.comments;
    this.liked = video.liked;
  }
}

export const VIDEOS: Video[] = [
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/cah-ad.mp4",
    desc: "I made this site so that you can play #cardsagainsthumanity despite being in #quarantine! Link in bio.",
    sound: new Sound({desc: "original sound\ncards against quarantine"}),
    likes: 168302,
    comments: 3048,
    shares: 34931,
    liked: false
  }),
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/dorime.mp4",
    desc: "It haunts my #dreams",
    sound: new Sound({desc: "@somebody\ndorimeee (spooky)"}),
    likes: 2843967,
    comments: 28483,
    shares: 43812,
    liked: false
  }),
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/mario_piano.mp4",
    desc: "My #piano cover of #mario - #gaming #toptalent",
    sound: new Sound({desc: "original sound\nmario piano cover"}),
    likes: 99381,
    comments: 48313,
    shares: 13843,
    liked: false
  }),
  new Video({
    src: "https://open-video.s3-ap-southeast-2.amazonaws.com/portland.mp4",
    desc: "Thought this might be a bit cute... #lgbt #portland #guitar",
    sound: new Sound({desc: "original sound\nshe said to me (portland)"}),
    likes: 2593381,
    comments: 14399,
    shares: 9931,
    liked: false
  })
];
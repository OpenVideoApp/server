const types = `
  type APIResult {
    success: Boolean!
  }
  
  type APIError {
    error: String!
  }
  
  union APIResponse = APIResult | APIError
  
  type User {
    name: String!
    createdAt: Int!
    displayName: String
    profileBio: String
    profileLink: String
    profilePicURL: String
    following: Int
    followers: Int
    views: Int
    likes: Int
    followsYou: Boolean
    followedByYou: Boolean
  }
  
  type Login {
    token: String!
    since: Int!
    user: User!
  }
  
  type LoginError {
    error: String!
    forUsername: Boolean!
    forPassword: Boolean!
  }
  
  union UserInfo = User | APIError
  union LoginInfo = Login | LoginError
  
  type Sound {
    id: String!
    createdAt: Int!
    user: User!
    desc: String!
  }
  
  union SoundInfo = Sound | APIError
  
  type Video {
    id: String!
    createdAt: Int!
    user: User!
    sound: Sound!
    src: String!
    desc: String!
    views: Int!
    likes: Int!
    comments: Int!
    liked: Boolean!
  }
  
  enum VideoBuilderStatus {
    INITIATED
    UPLOADED
    TRANSCODED
  }
  
  type UploadableVideo {
    id: String!
    uploadURL: String!
    status: VideoBuilderStatus!
  }
  
  type WatchData {
    seconds: Int!
  }
  
  union VideoInfo = Video | APIError
  union UploadableVideoInfo = UploadableVideo | APIError
  union WatchInfo = WatchData | APIError
  
  type Comment {
    id: String!
    createdAt: Int!
    user: User!
    body: String!
    likes: Int!
    liked: Boolean!
  }
  
  union CommentInfo = Comment | APIError
  
  type Query {
    user(name: String!): UserInfo!
    following(name: String!): [User!]
    followers(name: String!): [User!]
    
    sound(id: String!): SoundInfo!
    video(id: String!): VideoInfo!
    
    comment(id: String!): CommentInfo!
    comments(videoId: String!): [Comment]
    
    me: UserInfo!
    videos(count: Int = 1): [Video!]
  }
  
  type Mutation {
    createUser(name: String!, password: String!, device: String): LoginInfo!
    login(username: String!, password: String!, device: String!): LoginInfo!
    
    loginWithGoogle(idToken: String!): APIResponse!
    
    followUser(username: String!, remove: Boolean = false): APIResponse!
    
    createSound(desc: String!): SoundInfo!
    createVideo(soundId: String!, desc: String!): VideoInfo!
    
    uploadVideo(desc: String!, soundDesc: String!): UploadableVideoInfo!
    
    watchVideo(videoId: String!, seconds: Int!): WatchInfo!
    likeVideo(videoId: String!, remove: Boolean = false): APIResponse!
    
    addComment(videoId: String!, body: String!): CommentInfo!
    likeComment(commentId: String!, remove: Boolean = false): APIResponse!
  }
`;

export default types;
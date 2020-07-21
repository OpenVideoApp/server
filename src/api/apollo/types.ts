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
    createdAt: Int
    displayName: String
    profilePicURL: String
  }
  
  type Login {
    token: String!
    since: Int!
    user: User!
  }
  
  union LoginInfo = Login | APIError
  union UserInfo = User | APIError
  
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
  }
  
  type WatchData {
    seconds: Int!
  }
  
  union VideoInfo = Video | APIError
  union WatchInfo = WatchData | APIError
  
  type Comment {
    id: String!
    createdAt: Int!
    video: Video!
    user: User!
    body: String!
  }
  
  union CommentInfo = Comment | APIError
  
  type Query {
    user(name: String!): UserInfo!
    sound(id: String!): SoundInfo!
    video(id: String!): VideoInfo!
    comment(id: String!): CommentInfo!
    
    me: UserInfo!
    videos(count: Int = 1): [Video!]
  }
  
  type Mutation {
    createUser(name: String!, password: String!, displayName: String, profilePicURL: String): UserInfo!
    login(username: String!, password: String!, device: String!): LoginInfo!
    
    createSound(desc: String!): SoundInfo!
    createVideo(soundId: String!, src: String!, desc: String!): VideoInfo!
    
    watchVideo(videoId: String!, seconds: Int!): WatchInfo!
    likeVideo(videoId: String!, remove: Boolean = false): APIResponse!
    
    addComment(videoId: String!, body: String!): CommentInfo!
  }
`;

export default types;
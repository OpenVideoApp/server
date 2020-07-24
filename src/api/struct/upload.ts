export enum VideoBuilderStatus {
  INITIATED,
  UPLOADED,
  TRANSCODED
}

export class UploadableVideo {
  id: string;
  uploadURL: string;
  status: string;

  constructor(id: string, uploadURL: string, status: VideoBuilderStatus) {
    this.id = id;
    this.uploadURL = uploadURL;
    this.status = VideoBuilderStatus[status];
  }

  get __typename() {
    return "UploadableVideo";
  }
}
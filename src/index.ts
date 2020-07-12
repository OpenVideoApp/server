import express = require("express");
import {Video, VIDEOS} from "./video/video";

const app: express.Application = express();
app.set("port", process.env.PORT || 3000);
app.use(express.json());

const http = require("http").createServer(app);

app.get("/status", (req, res) => {
  res.send({
    status: "ok"
  });
});

app.post("/video", (req, res) => {
  let count = req.body.count || 1;
  let videos: Video[] = [];

  console.info(`Requested ${count} videos...`);

  for (let i = 0; i < count; i++) {
    // Simply select a random video
    videos.push(VIDEOS[Math.floor(Math.random() * VIDEOS.length)]);
  }

  res.status(201);
  res.send(videos);
});

const server = http.listen(process.env.PORT || 3000, () => {
  console.log("Listening on port %d.", server.address().port);
});

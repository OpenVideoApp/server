import express = require("express");
import {Video, VIDEOS} from "./video/video";

const app: express.Application = express();
app.set("port", process.env.PORT || 3000);
app.use(express.json());

const http = require("http").createServer(app);

app.get("/status", (req, res) => {
  res.send({
    status: "ok"
  })
});

app.post("/video", (req, res) => {
  let params = req.body;
  console.info("Requested video with params:", params);

  let video: Video = VIDEOS[Math.floor(Math.random() * VIDEOS.length)];
  res.status(201);
  res.send(video);
});

const server = http.listen(process.env.PORT || 3000, () => {
  console.log("Listening on port %d.", server.address().port);
});

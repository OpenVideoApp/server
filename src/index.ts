import express = require("express");
const db = require("./neo4j")();

const app: express.Application = express();
app.set("port", process.env.PORT || 3000);
app.use(express.json());

const http = require("http").createServer(app);

app.get("/status", (req, res) => {
  res.send({
    status: "ok"
  });
});

app.get("/user", async(req, res) => {
  res.send(await db.getUser(
    req.query.name
  ));
});

app.post("/user", async (req, res) => {
  res.send(await db.createUser(
    req.body.name,
    req.body.displayName,
    req.body.profilePicURL
  ));
});

app.post("/sound", async (req, res) => {
  res.send(await db.createSound(
    req.body.name,
    req.body.user
  ));
});

app.post("/video", async (req, res) => {
  res.send(await db.createVideo(
    req.body.name,
    req.body.user,
    req.body.sound
  ));
});

app.post("/follow", async (req, res) => {
  res.send(await db.follow(
    req.body.me,
    req.body.them
  ));
});

const server = http.listen(process.env.PORT || 3001, () => {
  console.log("Listening on port %d.", server.address().port);
});

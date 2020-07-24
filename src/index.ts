import express from "express";
import {ApolloServer, gql} from "apollo-server-express";
import types from "./api/apollo/types";
import resolvers from "./api/apollo/resolvers";
import db from "./api/db";
import {AuthData} from "./api/struct/user";
import {handleNotification} from "./sns/handler";

const app = express();

app.post("/sns", express.text(), (req, res) => {
  res.send(handleNotification(req));
});

const server = new ApolloServer({
  typeDefs: gql(types),
  resolvers,
  context: async ({req}) => {
    const username = req.headers.username;
    if (username) {
      let valid = await db.validateLogin(username as string, req.headers.token as string || "");
      return new AuthData(valid, username as string);
    } else return AuthData.Invalid;
  }
});

server.applyMiddleware({app});

app.listen({port: 4000}, () => {
  console.log("Server running on port 4000!");
});
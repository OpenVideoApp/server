import {ApolloServer, gql} from "apollo-server";
import types from "./api/apollo/types";
import resolvers from "./api/apollo/resolvers";
import db from "./api/db";
import {AuthData} from "./api/struct/user";

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

server.listen().then(({url}: {url: string}) => {
  console.info(`Test server ready at ${url}`);
});
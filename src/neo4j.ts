import neo4j from "neo4j-driver";
import {v4 as uuidv4} from "uuid";
import {unixTime} from "./helpers";

const driver = neo4j.driver(
    process.env.NEO_HOST || "bolt://localhost:8000",
    neo4j.auth.basic(
        process.env.NEO_USER || 'neo4j',
        process.env.NEO_PASS || "password"
    )
);

class Database {
  session = driver.session();

  async createUser(name?: string, displayName?: string, profilePicURL?: string): Promise<object> {
    if (!name || !displayName || !profilePicURL) return {
      error: "Missing Data"
    };

    try {
      let result = await this.session.run(`
        MATCH (user:User)
        WHERE user.name = $name
        RETURN user
      `, {
        "name": name
      });

      if (result.records.length > 0) return {
        error: "User already exists"
      };

      await this.session.run(`
        CREATE (
          a: User $props
        ) RETURN a
      `, {
        "props": {
          "name": name,
          "createdAt": unixTime(),
          "displayName": displayName,
          "profilePicURL": profilePicURL
        }
      });
      return {
        success: true
      }
    } catch (error) {
      console.info("Error creating user:", error);
      return {error: error};
    }
  }

  async getUser(name?: string): Promise<object> {
    if (!name) return {
      error: "Missing Data"
    };

    try {
      let result = await this.session.run(`
        MATCH (user:User)
        WHERE user.name = $name
        RETURN user
      `, {
        "name": name
      });

      if (result.records.length == 0) return {
        error: "Invalid User"
      };

      return result.records[0].get("user").properties;
    } catch (error) {
      console.info("Error getting user:", error);
      return {error: error};
    }
  }

  async createSound(desc?: string, user?: string): Promise<object> {
    if (!desc || !user) return {
      error: "Missing Data"
    };

    let uuid = uuidv4();

    try {
      let result = await this.session.run(`
        MATCH (user:User)
        WHERE user.name = $name
        RETURN user
      `, {
        "name": user
      });

      if (result.records.length == 0) return {
        error: "Invalid user"
      };

      await this.session.run(`
        MATCH (user: User)
        WHERE user.name = $user
        CREATE (
          sound: Sound $props
        )
        CREATE (user)-[r:RECORDED]->(sound)
        RETURN sound
      `, {
        "props": {
          "uuid": uuid,
          "createdAt": unixTime(),
          "desc": desc
        },
        "user": user
      });

      return {
        success: true,
        uuid: uuid
      };
    } catch (error) {
      console.info("Error creating sound:", error);
      return {error: error};
    }
  }

  async createVideo(desc?: string, user?: string, sound?: string): Promise<object> {
    if (!desc || !user || !sound) return {
      error: "Missing Data"
    };

    let uuid = uuidv4();

    try {
      let result = await this.session.run(`
        MATCH (user:User), (sound: Sound)
        WHERE user.name = $user AND sound.uuid = $sound
        RETURN user, sound
      `, {
        "user": user,
        "sound": sound
      });

      if (result.records.length == 0) return {
        error: "Invalid user or sound"
      };

      await this.session.run(`
        MATCH (user: User), (sound: Sound)
        WHERE user.name = $user AND sound.uuid = $sound
        CREATE (
          video: Video $props
        )
        CREATE (user)-[ur:FILMED]->(video)
        CREATE (video)-[sr:USES]->(sound)
        RETURN video
      `, {
        "props": {
          "uuid": uuid,
          "createdAt": unixTime(),
          "desc": desc
        },
        "user": user,
        "sound": sound
      });
      return {
        success: true,
        uuid: uuid
      }
    } catch (error) {
      console.info("Error creating video:", error);
      return {error: error};
    }
  }

  async follow(me?: string, them?: string): Promise<object> {
    if (!me || !them) return {
      error: "Missing Data"
    };

    try {
      let result = await this.session.run(`
        MATCH (me: User), (them: User)
        WHERE me.name = $me AND them.name = $them
        CREATE (me)-[r:FOLLOWS $props]->(them)
        RETURN r
      `, {
        "me": me,
        "them": them,
        "props": {
          "since": unixTime()
        }
      });
      return {
        result: result
      };
    } catch (error) {
      console.info("Error adding follow:", error);
      return {error: error};
    }
  }
}

export = () => new Database();
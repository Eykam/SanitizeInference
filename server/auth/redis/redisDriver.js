const { set, publishChannel, subscribeChannel } = require("./redisClient");
const { setTokens } = require("../models/user");
const { ROLES, ROLES_TOKEN_MAP } = require("../roles");

publishChannel.on("ready", () => {
  // configure keyspaces event and specify expiring events with "Ex"
  publishChannel.config("SET", "notify-keyspace-events", "Ex");

  // subscribe to the
  subscribeChannel.subscribe("__keyevent@0__:expired");

  // listen for expiring event messages
  subscribeChannel.on("message", async (channel, message) => {
    // retrieve key and value from shadowkey
    const [_, key, value] = message.split(":");

    const role = ROLES[value];
    const tokens = ROLES_TOKEN_MAP[role];

    console.log(
      `Refreshing Tokens for user: ${key}, role: ${value}, tokens:${tokens}`
    );

    await setTokens(tokens, key);

    publishChannel.del(key);
    set(key, value);
  });

  // set("102577842056682139667", "free");
});

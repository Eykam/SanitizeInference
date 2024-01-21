const Redis = require("ioredis");
const crypto = require("crypto");
require("dotenv").config();

const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_URL = process.env.REDIS_URL;

const publishChannel = new Redis({
  host: REDIS_URL,
  port: REDIS_PORT,
  keyPrefix: "creditsRefresh:",
  password: process.env.REDIS_PASSWORD,
});

const subscribeChannel = new Redis({
  host: REDIS_URL,
  port: REDIS_PORT,
  keyPrefix: "creditsRefresh:",
  password: process.env.REDIS_PASSWORD,
});

// const sessionChannel = new Redis({
//   host: REDIS_URL,
//   port: REDIS_PORT,
//   keyPrefix: "csrf:",
//   password: process.env.REDIS_PASSWORD,
// });

const set = (key, value) => {
  publishChannel.set(key, value);

  // use shadowkey to access the value field on the expire event message
  publishChannel.set(`${key}:${value}`, "");

  // set expire time on shadowkey
  publishChannel.expire(`${key}:${value}`, process.env.TOKENS_REFRESH_DURATION);
};

const getTTL = async (key) => {
  const data = await publishChannel.ttl(key);

  console.log("Getting TTL from redis...", data);
  return data;
};
// const setCSRF = async (key) => {
//   const csrfToken = crypto.randomUUID();
//   await sessionChannel.set(key, csrfToken);
//   await sessionChannel.expire(key, process.env.SESSION_DURATION_MS / 1000);

//   return csrfToken;
// };

// const getCSRF = async (key) => {
//   return await sessionChannel.get(key);
// };

// const deleteCSRF = async (key) => {
//   await sessionChannel.del(key);
// };

module.exports = {
  set,
  getTTL,
  publishChannel,
  subscribeChannel,
  // setCSRF,
  // deleteCSRF,
  // getCSRF,
};

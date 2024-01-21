const { request } = require("http");
const { OpenAI } = require("openai");
const spawn = require("child_process").spawn;
require("dotenv").config();

const API_TOKEN_LIMIT = 4097; //total number of tokens in Request + Response API allows
const CHARACTERS_PER_TOKEN = 4; //approximate number of characters per token
const TOKEN_LIMIT_OFFSET = 300; //tokens buffer so we dont hit API limit
const CATEGORIZATION_TOKENS = 4;

const openai = new OpenAI({
  organization: "org-nXlGtxRt8UTve4q9ojw9Iw6R",
  apiKey: process.env.OPENAI_API_KEY,
});

async function detectBadWords(wordSet, platform) {
  try {
    let chatGPTdata = await getGptResults(wordSet, platform);
    const pythonBadWords = await getLocalModelResults(wordSet);

    console.log("pythonBadWords: ", pythonBadWords);
    console.log("chatGPTdata", chatGPTdata);

    Object.keys(pythonBadWords).forEach((currWord) => {
      if (
        chatGPTdata[currWord]["percentage"] <
        pythonBadWords[currWord]["probability"]
      ) {
        chatGPTdata[currWord] = {
          percentage: pythonBadWords[currWord]["probability"],
          reason: pythonBadWords[currWord]["reason"],
        };
      }
    });

    return chatGPTdata;
  } catch (e) {
    console.log("Error badWord Request: ", e);
    return {};
  }
}

function generateContext(wordSet, platform) {
  // const systemContent = `You are a bot used to detect words to censor. Your job is to iterate through a list of words from a transcription of a video (wordList)
  //   and select bad words that need to be censored, based on the social media platform the video is intended for (platform). You prioritize censoring racial slurs,
  //   profanity, and violence.`;
  // const userContent = `platform = ${platform},
  //   wordList =  \n[${[...wordSet].join(", ")}].
  //   Return a javascript object with words you've decided to censor (from wordList) as keys, and their corresponding value equal to why it was censored.
  //   If there are no bad words, return an empty object, do not label normal words as bad. Make sure the object is valid javascript. It must have an open and closed bracket, with key-values pairs separated by commas`;

  const systemContent = `You are a content moderation bot. You are extremely familiar with the community guidelines from every popular social media site, such as Youtube, 
  instagram, twitter, facebook, tiktok, etc. , and how to avoid getting demonetized on each of the platforms. Since you are extremely familiar with the community guidelines, 
  given a specified platform , you are able to take a list of words from a video, and determine each word's probability of causing demonetization, along with the reason it 
  would cause demonetization. You are extremely careful in calculating the correct probability.`;

  const userContent = `platform = ${platform}, 
    wordList =  \n[${[...wordSet].join(", ")}].

    Your task: Return only a javascript object, where each key is a word from wordList, and its corresponding value is a object {percentage, reason}. Where "percentage" is 
    the probability (number between 0-1, rounded to the nearest hundredth) the word causes demonetization, and "reason" is a string that is 3 words max, and represents what 
    guideline the word may violate on the given social media platform ,"platform". Take your time with each word, and make sure to calculate its percentage and reason accurately.`;

  return { systemContent: systemContent, userContent: userContent };
}

async function getGptResults(wordSet, platform) {
  const unbatchedContext = generateContext([], platform);
  const systemContent = unbatchedContext["systemContent"];
  const userContent = unbatchedContext["userContent"];

  console.log(
    "Total characters in static prompt: ",
    systemContent.length + userContent.length
  );

  async function callApi(wordSet) {
    const requestContext = generateContext(wordSet, platform);

    console.log(
      "Current API call request size in chars:",
      requestContext["systemContent"].length +
        requestContext["userContent"].length
    );

    const response = openai.chat.completions.create(
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: requestContext["systemContent"],
          },
          {
            role: "user",
            content: requestContext["userContent"],
          },
        ],
        temperature: 0,
      },
      { maxRetries: 5 }
    );

    return response;
  }

  const batchParams = getBatchParams(
    wordSet,
    systemContent.length,
    userContent.length
  );

  const numBatches = batchParams["numBatches"];
  const batchSize = batchParams["batchSize"];

  let wordList = [...wordSet];
  let responses = [];
  let batches = Array.from(Array(numBatches).keys());

  responses = batches.map((x) => {
    lowerIndexLimit = x * batchSize;
    upperIndexLimit = Math.min(lowerIndexLimit + batchSize, wordList.length);

    let data = wordList.slice(lowerIndexLimit, upperIndexLimit);
    console.log(
      "Batch",
      x,
      "range :",
      [lowerIndexLimit, upperIndexLimit],
      "out of",
      wordList.length - 1
    );

    response = callApi(new Set(data));
    return response;
  });

  const results = await Promise.all(responses);

  let flat = {};

  results.forEach(async (currResponse) => {
    let readyResponse = await currResponse.choices[0].message.content;
    let arr = readyResponse.match(/{(.*\n)*/gm);

    if (!arr.includes("}")) {
      arr += "}";
      arr = arr.replace(",,", ",");
    }

    const chatGPTdata = await JSON.parse(arr);

    Object.keys(chatGPTdata).forEach((word) => {
      flat[word] = chatGPTdata[word];
    });
  });

  console.log("Flattened GPT:", flat);
  return flat;
}

function getBatchParams(wordSet, systemLength, userLength) {
  const numChars = getNumChars(wordSet);
  const numWords = wordSet.size;
  const contextLength = systemLength + userLength;
  const contextTokens = contextLength / CHARACTERS_PER_TOKEN;
  // const tokenLimit = Math.floor(
  //   (API_TOKEN_LIMIT - contextTokens) / 2 -
  //     CATEGORIZATION_TOKENS * (wordSet.size * 0.1)
  // );
  const apiWordLimitGuess = 100;
  // const batchSize = tokenLimit * CHARACTERS_PER_TOKEN;
  const batchSize = apiWordLimitGuess;
  // const numBatches = Math.ceil(numChars / batchSize);
  const numBatches = Math.ceil(numWords / batchSize);

  console.log("Total request size in characters:", numChars + contextLength);
  console.log(
    "Gpt Request character limit:",
    API_TOKEN_LIMIT * CHARACTERS_PER_TOKEN
  );
  // console.log("WordList Character Limit:", batchSize);
  console.log("NumBatches:", numBatches);
  console.log("NumWords:", numWords);
  console.log("WordsPerBatch:", batchSize);

  return { numBatches: numBatches, batchSize: batchSize };
}

async function getLocalModelResults(wordSet) {
  return new Promise(async (resolve, reject) => {
    try {
      const pythonProcess = spawn("python3", [
        "./profanityCheck.py",
        [...wordSet].join(", "),
      ]);

      let bufferArray = "";

      pythonProcess.stdout.on("data", async (data) => {
        pyData = uint8arrayToString(data);

        bufferArray += pyData;
      });

      pythonProcess.on("close", async (code) => {
        if (code === 0) {
          let pythonBadWords = {};

          //Hack to make sure chatgpt

          eval(bufferArray).forEach((currWord) => {
            pythonBadWords[currWord] = {
              probability: 0.95,
              reason: "profanity",
            };
          });

          //Hack to catch words whisper model automatically censored
          [...wordSet].forEach((currWord) => {
            console.log(
              "Checking for *: ",
              currWord,
              " condition: ",
              currWord.includes("*")
            );
            if (currWord.includes("*"))
              pythonBadWords[currWord] = {
                probability: 0.95,
                reason: "profanity",
              };
          });

          resolve(pythonBadWords);
        }
      });
    } catch (e) {
      setTimeout(function () {
        reject(new Error("Error on local model:" + e));
      }, 100);
    }
  });
}

const uint8arrayToString = function (data) {
  return String.fromCharCode.apply(null, data);
};

function getNumChars(wordSet) {
  return [...wordSet].reduce((prev, curr) => prev + curr.length, 0);
}

module.exports = {
  detectBadWords: detectBadWords,
};

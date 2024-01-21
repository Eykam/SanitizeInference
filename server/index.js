const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const spawn = require("child_process").spawn;
const app = express();

const { transcriptionTestResponse } = require("./utils/testData.js");

const ffmpegStatic = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const detectBadWords = require("./utils/badWordDetector.js").detectBadWords;
const { set, getTTL } = require("./auth/redis/redisClient.js");
const fs = require("fs");
require("./auth/redis/redisDriver.js");
require("dotenv").config();

// =========================================== CONSTANTS ===========================================
const FILESIZELIMIT = "100mb";
const UPLOADS = "./uploads";
const PORT = "8800";
const FILETYPES = [
  "video/mov",
  "video/quicktime",
  "video/mp4",
  "video/mpeg",
  "video/x-msvideo",
  "audio/wav",
  "audio/mpeg",
  "audio/x-wav",
  "audio/aac",
  "audio/webm",
  "video/webm",
];

ffmpeg.setFfmpegPath(ffmpegStatic);

// =========================================== HELPER FUNCTIONS ===========================================
var uint8arrayToString = function (data) {
  return String.fromCharCode.apply(null, data);
};

async function censorAudio(filename, timestamps) {
  let newName = "./uploads/censored-" + filename;
  let path = "./uploads/" + filename;

  let audioFilters = [];
  timestamps.forEach((currTimestamp) => {
    const currFilter = {
      filter: "volume",
      options: {
        enable: `between(t,${currTimestamp[0]},${currTimestamp[1]})`,
        volume: "0",
      },
    };

    audioFilters.push(currFilter);
  });

  console.log("AudioFilters: ", audioFilters);
  console.log("Path to file: ", path);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .addInput("./uploads/" + filename)
      .addInput(path)
      .audioFilters(audioFilters)
      .outputOptions(["-map 0:v?", "-map 1:a", "-c:v copy", "-shortest"])
      .saveToFile(newName)
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`Processing : ${Math.floor(progress.percent)}% Done`);
        }
      })
      .on("end", () => {
        console.log("Muted timestamps Successfully! \n", "Name: " + newName);
        resolve(true);
      })
      .on("error", (error) => {
        console.log("Failed to mute timestamps: ", error);
        reject(new Error("Failed to mute timestamps"));
      });
  });
}

async function extractAudio(fileName) {
  let newName = "./uploads/audio-" + fileName.split(".")[0] + ".mp3";
  let directory = "./uploads/" + fileName;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(directory)
      .outputOptions("-ab", "48k")
      .saveToFile(newName)
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`Processing : ${Math.floor(progress.percent)}% Done`);
        }
      })
      .on("end", () => {
        console.log(
          "Extracted audio Successfully! \n",
          "Name: audio-",
          fileName
        );
        resolve(true);
      })
      .on("error", (error) => {
        console.log("Failed to extract audio");
        reject(new Error("Failed to extract audio"));
      });
  });
}

// =========================================== MIDDLEWARE ===========================================

const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    console.log("File: ", file);
    console.log("Request path", req.path);
    let filename;

    if (req.path === "/file") {
      filename = req.body.uuid + path.extname(file.originalname);
    } else {
      filename = file.originalname;
    }

    cb(null, filename);
  },
  destination: function (req, file, cb) {
    if (req.path === "/fetchTranslation") {
      let dir = UPLOADS + "/" + file.originalname.split("@")[0];
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      cb(null, dir);
    } else {
      cb(null, UPLOADS);
    }
  },
});

const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.raw({ type: FILETYPES, limit: FILESIZELIMIT }));
app.use(express.json());

app.use(
  cors({
    origin: [
      // "*",
      process.env.FRONTEND_URL,
      process.env.DEV_URL,
    ],
    credentials: true,
  })
);

// =========================================== PATHS ===========================================
app.get("/test", (req, res) => {
  console.log("user:", req.user);
  console.log("Origin:", req.origin);
  res.send("User:" + req.user);
});

app.post("/file", upload.single("file"), async (req, res) => {
  console.log("Serialized Name: ", req.file.filename);

  res
    .setHeader("origin-path", "/file")
    .setHeader("size", req.file.size)
    .setHeader("original-name", req.file.originalname)
    .send({
      message: "success",
      body: {
        uuid: req.file.filename,
        size: req.file.size,
        type: req.file.mimetype,
      },
    });
});

app.post("/fetchTranscription", async (req, res) => {
  let extracted = false;
  let message = "error";
  let fileName = req.body.filename;
  let contentType = req.body.contentType;

  if (fileName != null && fileName !== "") {
    extracted = await extractAudio(fileName);

    if (!extracted) {
      return res.status(400).send({ message: "Failed to Extract Audio" });
    }

    try {
      console.log("Hitting async endpoint...");
      console.log("filename: ", "./uploads/" + fileName);
      console.log("contentType: ", contentType);

      // const pythonProcess = spawn("python3", [
      //   "./endpoint.py",
      //   "./uploads/" + fileName,
      //   contentType,
      // ]);
      const pythonProcess = spawn("python3", [
        "./whisperDriver.py",
        "./uploads/" + fileName,
      ]);

      const startTime = Date.now();

      console.log(
        "============================== Running Whisper ==================================="
      );

      let bufferArray = "";

      pythonProcess.stdout.on("data", async (data) => {
        console.log("Collecting transcription...");

        data = uint8arrayToString(data);

        if (data.includes("Errno")) console.log("Error Whisper Model: ", data);

        if (!data.includes("sagemaker.config")) {
          bufferArray += data;
        } else {
          console.log("Endpoint.py :", data);
        }
      });

      pythonProcess.on("close", async (code) => {
        console.log(`Child process exited with code ${code}`);

        if (code === 0) {
          const endTime = Date.now();
          const total = ((endTime - startTime) / 1000).toFixed(2);
          const output = eval(bufferArray);

          // const modelTime = output[0];
          // const words = output[1];

          // console.log("Model Time: ", modelTime);
          console.log("Total Time: ", total);
          // console.log(
          //   "Provisioning Overhead: ",
          //   Number(total) - Number(modelTime)
          // );

          const wordList = new Set();

          //dont forget to change back to words
          output.forEach((curr) => {
            if (curr["text"] !== undefined) {
              wordList.add(curr["text"].toLowerCase().replace(/[^\w\*]/g, ""));
            }
          });

          // console.log("Detected Words: ", words);
          console.log("Detected Words: ", output);
          console.log("Number of unique words in wordList: ", wordList.size);

          let numChars = [...wordList].reduce(
            (prev, curr) => prev + curr.length,
            0
          );

          console.log("Number of characters in wordList: ", numChars);

          console.log(
            "\n=========================================BADWORDS======================================\n"
          );

          let badWords = await detectBadWords(wordList, "youtube");
          console.log(badWords);

          return res.setHeader("origin-path", "/fetchTranscription").send({
            // data: words,
            data: output,
            requestTime: total,
            badWords: badWords,
          });
        } else {
          console.log("Error whisper Driver");
          return res.status(400).send({ message: "Transcription failed" });
        }
      });
    } catch (e) {
      console.log("Error running whisper on audio File: ", e);
      return res
        .status(400)
        .send({ message: "Error running whisper on audio File: " + e });
    }
  }
});

// app.post("/fetchTranscription", async (req, res) => {
//   console.log("sending test transcription");
//   return res
//     .setHeader("origin-path", "/fetchTranscription")
//     .send(transcriptionTestResponse);
// });

app.post("/fetchTranslation", upload.single("file"), async (req, res) => {
  console.log("Testing translation");
  const filename = req.file.originalname;
  console.log("file:", filename);

  try {
    let fileDir = UPLOADS + "/" + filename.split("@")[0] + "/";
    let filePath = fileDir + filename;
    console.log("file path:", filePath);
    const translationProcess = spawn("whisper", [
      filePath,
      "--task",
      "translate",
      "--model",
      "large-v3",
      "-f",
      "srt",
      "-o",
      fileDir,
    ]);

    const startTime = Date.now();

    console.log(
      "============================== Running Translation ==================================="
    );

    translationProcess.stdout.on("data", async (data) => {
      console.log("Translation data:", uint8arrayToString(data));
    });

    translationProcess.on("close", async (code) => {
      console.log(`Child process exited with code ${code}`);

      if (code === 0) {
        const endTime = Date.now();
        const total = ((endTime - startTime) / 1000).toFixed(2);

        const videoUrl = filePath;
        const srtUrl = "subtitles=" + fileDir + filename.split(".")[0] + ".srt";
        const subtitleVideoUrl = fileDir + "subtitle-" + filename;

        console.log("Total Time: ", total);

        const subtitleProcess = spawn("ffmpeg", [
          "-y",
          "-i",
          videoUrl,
          "-vf",
          srtUrl,
          subtitleVideoUrl,
        ]);

        subtitleProcess.stdout.on("data", async (data) => {
          console.log("Subtitle data:", uint8arrayToString(data));
        });

        subtitleProcess.on("close", async (code) => {
          if (code === 0) {
            res.sendFile(path.join(__dirname, subtitleVideoUrl));
          }
        });
      } else {
        console.log("Error whisper Driver");
        return res.status(400).send({ message: "Translation failed" });
      }
    });
  } catch (e) {
    console.log("Error running translation on audio File: ", e);
    return res
      .status(400)
      .send({ message: "Error running translation on audio File: " + e });
  }
});

app.post("/fetchCensorship", async (req, res) => {
  const wordList = req.body.badWords;
  const filename = req.body.filename;

  let timestamps = [];

  Object.keys(wordList).forEach((currWord) => {
    wordList[currWord].forEach((currTimestamp) => {
      if (!(currTimestamp in timestamps)) timestamps.push(currTimestamp);
    });
  });

  //give uuid of audio file, flatten object into list of unique timestamps, call ffmpeg on timestamp to censor audio
  //return file with audio concatenated back to video
  await censorAudio(filename, timestamps);
  // const censoredFile = await readCensoredFile("./uploads/censored-" + filename);

  res
    .setHeader("origin-path", "/fetchCensorship")
    .sendFile(path.join(__dirname, "./uploads/censored-" + filename));
});

app.post("/refreshList", (req, res) => {
  console.log(
    `adding to refresh list ${req.headers["id"]}, ${req.headers["role"]}`
  );
  set(req.headers["id"], req.headers["role"]);
  res.status(200).send();
});

app.post("/ttl", async (req, res) => {
  const key = req.body["key"];
  const ttl = await getTTL(key);
  console.log(`TTL for ${key} => ${ttl}`);
  return res.json({ ttl: ttl });
});

// ================================================== SERVER INITIALIZATION ==================================================

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

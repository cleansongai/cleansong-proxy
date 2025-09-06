import * as gradio from "@gradio/client";
import { Readable } from "stream";

export default async function handler(req, res) {
  console.log("Handler invoked. Method:", req.method);
  if (req.method !== "POST") {
    console.log("Method not allowed");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Ensure req.body is parsed (Vercel does not do this automatically)
    if (!req.body || typeof req.body === "string") {
      console.log("Parsing request body...");
      req.body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    console.log("Request body:", req.body);

    const { file } = req.body;
    if (!file) {
      console.log("No file provided in request body");
      return res.status(400).json({ error: "No file provided" });
    }

    // Check for HF_TOKEN
    if (!process.env.HF_TOKEN) {
      console.log("Missing HF_TOKEN environment variable");
      return res.status(500).json({ error: "Missing HF_TOKEN environment variable" });
    }
    console.log("HF_TOKEN is present");

    // Decode base64 from frontend
    let buffer;
    try {
      buffer = Buffer.from(file.split(",")[1], "base64");
      console.log("Buffer created. Length:", buffer.length);
    } catch (e) {
      console.log("Error decoding base64 file:", e);
      return res.status(400).json({ error: "Invalid file encoding" });
    }

    // Connect to Hugging Face Space
    let client;
    try {
      console.log("Connecting to Hugging Face Space...");
      client = await gradio.connect("CleanSong/Lyric-Cleaner", {
        hf_token: process.env.HF_TOKEN // only needed if Space is private
      });
      console.log("Connected to Hugging Face Space");
    } catch (e) {
      console.log("Error connecting to Hugging Face Space:", e.message, e.stack);
      return res.status(500).json({ error: `Failed to connect to Hugging Face Space: ${e.message}` });
    }

    // Call /process_song
    let result;
    try {
      console.log("Calling /process_song with buffer...");
      result = await client.predict("/process_song", {
        audio_path: buffer // pass buffer directly
      });
      console.log("Prediction result:", result);
    } catch (e) {
      console.log("Error during prediction:", e);
      return res.status(500).json({ error: "Prediction failed" });
    }

    // Return the 3 outputs
    if (!result || !result.data) {
      console.log("Result or result.data is undefined", result);
      return res.status(500).json({ error: "No data returned from prediction" });
    }
    return res.status(200).json({
      original: result.data[0],
      cleaned: result.data[1],
      audio: result.data[2]
    });
  } catch (err) {
    console.error("General error:", err.stack || err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}

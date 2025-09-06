import { Client } from "@gradio/client";
import { Readable } from "stream";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Ensure req.body is parsed (Vercel does not do this automatically)
    if (!req.body || typeof req.body === "string") {
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

    const { file } = req.body;
    if (!file) return res.status(400).json({ error: "No file provided" });

    // Check for HF_TOKEN
    if (!process.env.HF_TOKEN) {
      return res.status(500).json({ error: "Missing HF_TOKEN environment variable" });
    }

    // Decode base64 from frontend
    const buffer = Buffer.from(file.split(",")[1], "base64");
    // Hugging Face client may accept Buffer or Readable stream in Node.js
    // If it requires a Blob, you may need to use a polyfill or pass the buffer directly

    // Connect to Hugging Face Space
    const client = await Client.connect("CleanSong/Lyric-Cleaner", {
      hf_token: process.env.HF_TOKEN // only needed if Space is private
    });

    // Call /process_song
    const result = await client.predict("/process_song", {
      audio_path: buffer // pass buffer directly
    });

    // Return the 3 outputs
    return res.status(200).json({
      original: result.data[0],
      cleaned: result.data[1],
      audio: result.data[2]
    });
  } catch (err) {
    console.error(err.stack || err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}

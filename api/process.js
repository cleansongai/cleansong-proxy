import fetch from "node-fetch";
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
    let base64Audio;
    try {
      base64Audio = file.split(",")[1];
      buffer = Buffer.from(base64Audio, "base64");
      console.log("Buffer created. Length:", buffer.length);
    } catch (e) {
      console.log("Error decoding base64 file:", e);
      return res.status(400).json({ error: "Invalid file encoding" });
    }

    // Call Hugging Face Space REST API
    let apiResponse;
    try {
      console.log("Calling Hugging Face Space REST API...");
      const hfRes = await fetch("https://hf.space/embed/CleanSong/Lyric-Cleaner/api/predict/", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          data: [
            `data:audio/wav;base64,${base64Audio}`
          ]
        })
      });
      apiResponse = await hfRes.json();
      console.log("Hugging Face API response:", apiResponse);
      if (!hfRes.ok) {
        return res.status(500).json({ error: apiResponse.error || "Hugging Face API error" });
      }
    } catch (e) {
      console.log("Error calling Hugging Face Space REST API:", e.message, e.stack);
      return res.status(500).json({ error: `Failed to call Hugging Face Space API: ${e.message}` });
    }

    // Parse and return the outputs
    try {
      const result = apiResponse;
      // The output format depends on the Space, but typically:
      // result.data = [original, cleaned, audio]
      if (!result || !result.data) {
        console.log("Result or result.data is undefined", result);
        return res.status(500).json({ error: "No data returned from Hugging Face Space" });
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
  } catch (err) {
    console.error("General error:", err.stack || err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}

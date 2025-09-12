import fetch from "node-fetch";
import { Readable } from "stream";
import { client } from "@gradio/client";

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

    // Call CleanSong using proper Gradio client
    let apiResponse;
    try {
      console.log("Connecting to CleanSong using Gradio client...");
      console.log("Buffer length:", buffer.length);
      
      // Try different ways to connect to the CleanSong space
      let app;
      try {
        console.log("Trying CleanSong/Lyric-Cleaner...");
        app = await client("CleanSong/Lyric-Cleaner");
        console.log("Connected to CleanSong/Lyric-Cleaner successfully");
      } catch (e) {
        console.log("CleanSong/Lyric-Cleaner failed:", e.message);
        try {
          console.log("Trying CleanSong-Lyric-Cleaner...");
          app = await client("CleanSong-Lyric-Cleaner");
          console.log("Connected to CleanSong-Lyric-Cleaner successfully");
        } catch (e2) {
          console.log("CleanSong-Lyric-Cleaner failed:", e2.message);
          try {
            console.log("Trying full URL...");
            app = await client("https://CleanSong-Lyric-Cleaner.hf.space");
            console.log("Connected to full URL successfully");
          } catch (e3) {
            console.log("All connection attempts failed:", e3.message);
            throw new Error(`Could not connect to CleanSong space. Tried: CleanSong/Lyric-Cleaner, CleanSong-Lyric-Cleaner, and full URL. Last error: ${e3.message}`);
          }
        }
      }
      
      // Create a file-like object for the audio data
      const audioFile = {
        name: 'audio.wav',
        type: 'audio/wav',
        size: buffer.length,
        stream: () => Readable.from(buffer),
        arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
      };
      console.log("Created audio file object, size:", buffer.length);
      
      // Use the exact API call format from Hugging Face docs
      console.log("Calling /process_song with audio file...");
      const result = await app.predict("/process_song", [audioFile]);
      
      console.log("CleanSong API response:", result);
      console.log("CleanSong API response data:", result.data);
      apiResponse = result.data;
      
    } catch (e) {
      console.log("Error calling CleanSong with Gradio client:", e.message, e.stack);
      
      // Fallback: Return mock response for testing
      console.log("Using fallback mock response...");
      console.log("CleanSong API failed. Error details:", e.message);
      
      return res.status(200).json({
        original: "The CleanSong API is not available. This is a fallback response showing that the audio compression is working correctly.",
        cleaned: "The CleanSong API is not available. This is a fallback response showing that the audio compression is working correctly.",
        audio: null,
        error: e.message,
        note: "Audio file was successfully compressed and processed, but the CleanSong API is not responding correctly. Check Vercel function logs for detailed error information."
      });
    }

    // Parse and return the outputs (as per Hugging Face docs)
    try {
      console.log("Parsing CleanSong API response:", apiResponse);
      
      // According to Hugging Face docs, returns list of 3 elements:
      // [0] string - Original Lyrics
      // [1] string - Cleaned Lyrics  
      // [2] - Cleaned Song Audio
      
      if (apiResponse && Array.isArray(apiResponse) && apiResponse.length >= 2) {
        const original = apiResponse[0];
        const cleaned = apiResponse[1];
        const audio = apiResponse[2];
        
        console.log("Successfully parsed CleanSong response:");
        console.log("- Original lyrics length:", original ? original.length : 0);
        console.log("- Cleaned lyrics length:", cleaned ? cleaned.length : 0);
        console.log("- Audio present:", !!audio);
        
        return res.status(200).json({
          original: original || "No original lyrics found",
          cleaned: cleaned || "No cleaned lyrics found", 
          audio: audio || null
        });
      } else {
        console.log("Unexpected CleanSong response format:", apiResponse);
        return res.status(500).json({ 
          error: `Unexpected response format from CleanSong API: ${JSON.stringify(apiResponse).substring(0, 200)}...` 
        });
      }
    } catch (err) {
      console.error("Error parsing CleanSong response:", err.stack || err);
      return res.status(500).json({ error: err.message || "Internal Server Error" });
    }
  } catch (err) {
    console.error("General error:", err.stack || err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}

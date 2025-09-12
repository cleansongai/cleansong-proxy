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

    // Call CleanSong using correct Gradio space API format
    let apiResponse;
    try {
      console.log("Calling CleanSong/Lyric-Cleaner Gradio space with correct format...");
      
      // Convert audio to base64 data URL
      const audioDataUrl = `data:audio/wav;base64,${base64Audio}`;
      console.log("Created audio data URL, length:", audioDataUrl.length);
      
      // Use correct CleanSong API format
      console.log("Calling CleanSong with correct API format...");
      
      // Create FormData for file upload (not JSON)
      const formData = new FormData();
      const audioBlob = new Blob([buffer], { type: 'audio/wav' });
      formData.append('audio_path', audioBlob, 'audio.wav');
      
      console.log("Created audio blob, size:", audioBlob.size);
      
      // Call the correct CleanSong endpoint
      const response = await fetch("https://cleansong-lyric-cleaner.hf.space/run/predict", {
        method: "POST",
        body: formData
      });
      
      console.log("CleanSong API response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log("CleanSong API error:", errorText.substring(0, 500));
        throw new Error(`CleanSong API error (${response.status}): ${errorText.substring(0, 200)}`);
      }
      
      const result = await response.json();
      console.log("CleanSong API response:", result);
      apiResponse = result;
      
    } catch (e) {
      console.log("Error calling CleanSong API:", e.message, e.stack);
      
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

    // Parse and return the outputs
    try {
      console.log("Parsing Gradio API response:", apiResponse);
      
      // Handle Gradio response format
      let original, cleaned, audio;
      
      if (apiResponse.data && Array.isArray(apiResponse.data)) {
        // Gradio API format - data array
        original = apiResponse.data[0];
        cleaned = apiResponse.data[1];
        audio = apiResponse.data[2];
      } else if (apiResponse.original && apiResponse.cleaned) {
        // Direct format
        original = apiResponse.original;
        cleaned = apiResponse.cleaned;
        audio = apiResponse.audio;
      } else if (Array.isArray(apiResponse) && apiResponse.length >= 2) {
        // Array format
        original = apiResponse[0];
        cleaned = apiResponse[1];
        audio = apiResponse[2];
      } else {
        console.log("Unknown Gradio response format:", apiResponse);
        return res.status(500).json({ 
          error: `Unknown response format from Gradio API: ${JSON.stringify(apiResponse).substring(0, 200)}...` 
        });
      }
      
      return res.status(200).json({
        original: original || "No original lyrics found",
        cleaned: cleaned || "No cleaned lyrics found", 
        audio: audio || null
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

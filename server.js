import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@gradio/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Increase payload size limit for large audio files (50MB)
// Apply these limits before any other middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware for payload too large
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    console.log("Payload too large error caught:", error.message);
    return res.status(413).json({ 
      error: "File too large. Please try with a smaller audio file or ensure compression is working." 
    });
  }
  next(error);
});

// API endpoint for processing
app.post('/api/process', async (req, res) => {
  console.log("Handler invoked. Method:", req.method);
  console.log("Request body size:", req.get('content-length'));
  console.log("Content-Type:", req.get('content-type'));
  
  try {
    const { file } = req.body;
    if (!file) {
      console.log("No file provided in request body");
      return res.status(400).json({ error: "No file provided" });
    }

    // Check for HF_TOKEN
    if (!process.env.HF_TOKEN) {
      console.log("Missing HF_TOKEN environment variable");
      return res.status(500).json({ 
        error: "Missing HF_TOKEN environment variable. Please set it with: $env:HF_TOKEN=\"your_token_here\"" 
      });
    }
    console.log("HF_TOKEN is present");
    console.log("Note: Make sure your token has 'Write' permissions for Hugging Face Spaces API");

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

    // Call CleanSong using Gradio client
    let apiResponse;
    try {
      console.log("Connecting to CleanSong/Lyric-Cleaner using Gradio client...");
      
      // Connect to the Gradio space
      const client = await Client.connect("CleanSong/Lyric-Cleaner");
      console.log("Connected to Gradio space successfully");
      
      // Convert base64 to blob
      const audioBlob = new Blob([buffer], { type: 'audio/wav' });
      console.log("Created audio blob, size:", audioBlob.size);
      
      // Call the process_song endpoint
      console.log("Calling /process_song endpoint...");
      const result = await client.predict("/process_song", {
        audio_path: audioBlob
      });
      
      console.log("Gradio API response:", result);
      apiResponse = result;
      
    } catch (e) {
      console.log("Error calling CleanSong Gradio API:", e.message, e.stack);
      
      // Fallback: Return mock response for testing
      console.log("Using fallback mock response...");
      return res.status(200).json({
        original: "This is a fallback response. The CleanSong API is not available.",
        cleaned: "This is a fallback response. The CleanSong API is not available.",
        audio: null,
        error: e.message
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
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Make sure to set your HF_TOKEN environment variable');
});

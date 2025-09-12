import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

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

    // Call CleanSong using direct API approach (bypassing Gradio client)
    let apiResponse;
    try {
      console.log("=== DIRECT API CALL DEBUGGING ===");
      console.log("Using direct API call to bypass Gradio client window issues...");
      console.log("HF_TOKEN present:", !!process.env.HF_TOKEN);
      console.log("Buffer length:", buffer.length);
      console.log("Base64 audio length:", base64Audio.length);
      
      // Create a data URL for the audio
      const audioDataUrl = `data:audio/wav;base64,${base64Audio}`;
      console.log("Created audio data URL, length:", audioDataUrl.length);
      
      // Try the Gradio API endpoints directly
      const endpoints = [
        "https://cleansong-lyric-cleaner.hf.space/api/predict/",
        "https://cleansong-lyric-cleaner.hf.space/run/predict",
        "https://cleansong-lyric-cleaner.hf.space/gradio_api/predict/"
      ];
      
      console.log("=== TRYING DIFFERENT ENDPOINTS ===");
      for (const endpoint of endpoints) {
        try {
          console.log(`\n--- Trying endpoint: ${endpoint} ---`);
          
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.HF_TOKEN}`
            },
            body: JSON.stringify({
              data: [audioDataUrl]
            })
          });
          
          console.log(`Response status: ${response.status}`);
          console.log("Response headers:", Object.fromEntries(response.headers.entries()));
          
          if (response.ok) {
            const result = await response.json();
            console.log(`✅ SUCCESS with ${endpoint}!`);
            console.log("Result:", JSON.stringify(result, null, 2));
            apiResponse = result;
            break;
          } else {
            const errorText = await response.text();
            console.log(`❌ FAILED: ${endpoint} - ${response.status}`);
            console.log("Error:", errorText.substring(0, 200));
          }
        } catch (e) {
          console.log(`❌ ERROR with ${endpoint}:`, e.message);
        }
      }
      
      if (!apiResponse) {
        throw new Error("All API endpoints failed");
      }
      
    } catch (e) {
      console.log("Error with direct API calls:", e.message, e.stack);
      
      // Fallback: Return mock response for testing
      console.log("Using fallback mock response...");
      return res.status(200).json({
        original: "The CleanSong API is not available. This is a fallback response showing that the audio compression is working correctly.",
        cleaned: "The CleanSong API is not available. This is a fallback response showing that the audio compression is working correctly.",
        audio: null,
        error: e.message,
        note: "Audio file was successfully compressed and processed, but the CleanSong API is not responding correctly."
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

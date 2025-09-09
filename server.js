import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

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
      const response = await fetch("https://hf.space/embed/CleanSong/Lyric-Cleaner/api/predict/", {
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
      apiResponse = await response.json();
      console.log("Hugging Face API response:", apiResponse);
      if (!response.ok) {
        return res.status(500).json({ error: apiResponse.error || "Hugging Face API error" });
      }
    } catch (e) {
      console.log("Error calling Hugging Face Space REST API:", e.message, e.stack);
      return res.status(500).json({ error: `Failed to call Hugging Face Space API: ${e.message}` });
    }

    // Parse and return the outputs
    try {
      const result = apiResponse;
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
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Make sure to set your HF_TOKEN environment variable');
});

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

    // Call Hugging Face Space REST API
    let apiResponse;
    try {
      console.log("Calling Hugging Face Space REST API...");
      console.log("Token present:", !!process.env.HF_TOKEN);
      console.log("Token length:", process.env.HF_TOKEN ? process.env.HF_TOKEN.length : 0);
      
      // Try multiple API endpoint formats
      const apiEndpoints = [
        "https://CleanSong-Lyric-Cleaner.hf.space/api/predict/",
        "https://hf.space/embed/CleanSong/Lyric-Cleaner/api/predict/",
        "https://api-inference.huggingface.co/models/CleanSong/Lyric-Cleaner"
      ];
      
      let response;
      let lastError;
      
      for (const endpoint of apiEndpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          
          const requestBody = endpoint.includes("api-inference") 
            ? { inputs: `data:audio/wav;base64,${base64Audio}` }
            : { data: [`data:audio/wav;base64,${base64Audio}`] };
          
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.HF_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          });
          
          console.log(`Response status for ${endpoint}:`, response.status);
          
          if (response.ok) {
            console.log(`Success with endpoint: ${endpoint}`);
            break;
          } else {
            const errorText = await response.text();
            console.log(`Error with ${endpoint}:`, errorText.substring(0, 200));
            lastError = errorText;
          }
        } catch (err) {
          console.log(`Exception with ${endpoint}:`, err.message);
          lastError = err.message;
        }
      }
      
      if (!response || !response.ok) {
        throw new Error(`All API endpoints failed. Last error: ${lastError}`);
      }
      
      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));
      
      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      console.log("Response content-type:", contentType);
      
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.log("Non-JSON response received (first 1000 chars):", textResponse.substring(0, 1000));
        
        // Try to parse as JSON anyway in case content-type is wrong
        try {
          const jsonResponse = JSON.parse(textResponse);
          console.log("Successfully parsed as JSON despite content-type:", jsonResponse);
          apiResponse = jsonResponse;
        } catch (parseError) {
          console.log("Failed to parse as JSON:", parseError.message);
          return res.status(500).json({ 
            error: `Hugging Face API returned non-JSON response (${response.status}): ${textResponse.substring(0, 200)}...` 
          });
        }
      } else {
        apiResponse = await response.json();
      }
      
      console.log("Hugging Face API response:", apiResponse);
      
      if (!response.ok) {
        return res.status(500).json({ error: apiResponse.error || `Hugging Face API error (${response.status})` });
      }
    } catch (e) {
      console.log("Error calling Hugging Face Space REST API:", e.message, e.stack);
      
      // Fallback: Return mock response for testing
      console.log("Using fallback mock response...");
      return res.status(200).json({
        original: "This is a fallback response. The CleanSong API is not available.",
        cleaned: "This is a fallback response. The CleanSong API is not available.",
        audio: null
      });
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

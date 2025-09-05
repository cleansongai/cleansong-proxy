import { Client } from "@gradio/client";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { file } = req.body;
    if (!file) return res.status(400).json({ error: "No file provided" });

    // Decode base64 from frontend
    const buffer = Buffer.from(file.split(",")[1], "base64");
    const blob = new Blob([buffer], { type: "audio/wav" });

    // Connect to Hugging Face Space
    const client = await Client.connect("CleanSong/Lyric-Cleaner", {
      hf_token: process.env.HF_TOKEN // only needed if Space is private
    });

    // Call /process_song
    const result = await client.predict("/process_song", {
      audio_path: blob
    });

    // Return the 3 outputs
    return res.status(200).json({
      original: result.data[0],
      cleaned: result.data[1],
      audio: result.data[2]
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

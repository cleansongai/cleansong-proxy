import fetch from "node-fetch";
import FormData from "form-data";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const file = req.body?.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    // Convert base64 from frontend back into a Buffer
    const buffer = Buffer.from(file.split(",")[1], "base64");

    const formData = new FormData();
    formData.append("data", buffer, { filename: "input.wav" });

    const response = await fetch(
      "https://huggingface.co/spaces/CleanSong/Lyric-Cleaner/run/predict",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.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}`
        },
        body: formData
      }
    );

    const json = await response.json();
    return res.status(200).json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

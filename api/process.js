{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import fetch from "node-fetch";\
import FormData from "form-data";\
\
export default async function handler(req, res) \{\
  if (req.method !== "POST") \{\
    return res.status(405).json(\{ error: "Method not allowed" \});\
  \}\
\
  try \{\
    const file = req.body?.file;\
    if (!file) return res.status(400).json(\{ error: "No file provided" \});\
\
    // Convert base64 from frontend back into a Buffer\
    const buffer = Buffer.from(file.split(",")[1], "base64");\
\
    const formData = new FormData();\
    formData.append("data", buffer, \{ filename: "input.wav" \});\
\
    const response = await fetch(\
      "https://huggingface.co/spaces/CleanSong/Lyric-Cleaner/run/predict",\
      \{\
        method: "POST",\
        headers: \{\
          Authorization: `Bearer $\{process.env.HF_TOKEN\}`\
        \},\
        body: formData\
      \}\
    );\
\
    const json = await response.json();\
    return res.status(200).json(json);\
  \} catch (err) \{\
    console.error(err);\
    return res.status(500).json(\{ error: err.message \});\
  \}\
\}\
}

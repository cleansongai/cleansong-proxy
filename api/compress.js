import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse body
    if (!req.body || typeof req.body === "string") {
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
    const { file, fileType } = req.body;
    if (!file) return res.status(400).json({ error: "No file provided" });
    if (!process.env.FREECONVERT_API_KEY) {
      return res.status(500).json({ error: "Missing FREECONVERT_API_KEY env variable" });
    }

    // Prepare FreeConvert job
    const inputFormat = (fileType && fileType.split('/')[1]) || "mp3";
    const inputBody = {
      "tasks": {
        "import": { "operation": "import/upload" },
        "compress": {
          "operation": "compress",
          "input": "import",
          "input_format": inputFormat,
          "output_format": "mp3",
          "options": {
            "compression_method": "percentage",
            "target_size_percentage": 40
          }
        },
        "export-url": {
          "operation": "export/url",
          "input": ["compress"]
        }
      }
    };
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${process.env.FREECONVERT_API_KEY}`
    };

    // 1. Create job
    const jobRes = await fetch('https://api.freeconvert.com/v1/process/jobs', {
      method: 'POST',
      body: JSON.stringify(inputBody),
      headers
    });
    const job = await jobRes.json();
    if (!job.tasks || !job.tasks.import || !job.tasks.import.result || !job.tasks.import.result.form) {
      return res.status(500).json({ error: 'Failed to create FreeConvert job', details: job });
    }
    const uploadUrl = job.tasks.import.result.form.url;
    const uploadParams = job.tasks.import.result.form.parameters;

    // 2. Upload the file
    // file is a base64 data URL, convert to Buffer
    const base64Data = file.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const formData = new FormData();
    for (const key in uploadParams) {
      formData.append(key, uploadParams[key]);
    }
    formData.append('file', buffer, { filename: 'audio.' + inputFormat });

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(500).json({ error: 'Failed to upload file to FreeConvert', details: errText });
    }

    // 3. Poll for job completion
    let jobId = job.id;
    let status = '';
    let exportUrl = '';
    let pollCount = 0;
    while (status !== 'completed' && pollCount < 30) { // max ~90s
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.freeconvert.com/v1/process/jobs/${jobId}`, { headers });
      const pollJob = await pollRes.json();
      status = pollJob.status;
      if (status === 'completed') {
        const exportTask = Object.values(pollJob.tasks).find(t => t.operation === 'export/url');
        if (exportTask && exportTask.result && exportTask.result.files && exportTask.result.files[0]) {
          exportUrl = exportTask.result.files[0].url;
        }
      } else if (status === 'failed') {
        return res.status(500).json({ error: 'Compression failed', details: pollJob });
      }
      pollCount++;
    }
    if (!exportUrl) return res.status(500).json({ error: 'No export URL found' });

    // 4. Download the compressed file as a Buffer
    const compressedRes = await fetch(exportUrl);
    const compressedBuffer = Buffer.from(await compressedRes.arrayBuffer());
    // Convert to base64 data URL
    const base64Compressed = `data:audio/mp3;base64,${compressedBuffer.toString('base64')}`;
    return res.status(200).json({ file: base64Compressed });
  } catch (err) {
    console.error("/api/compress error:", err.stack || err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}

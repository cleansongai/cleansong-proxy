import { Client } from "@gradio/client";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Handler invoked. Method:', req.method);
    console.log('Request body size:', JSON.stringify(req.body).length);
    console.log('Content-Type:', req.headers['content-type']);

    const { audioData } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Check for HF token
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      console.log('HF_TOKEN not found in environment variables');
      return res.status(500).json({ error: 'HF_TOKEN not configured' });
    }
    console.log('HF_TOKEN is present');
    console.log('Note: Make sure your token has \'Write\' permissions for Hugging Face Spaces API');

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    console.log('Buffer created. Length:', audioBuffer.length);

    console.log('=== DIRECT API CALL DEBUGGING ===');
    console.log('Using direct API call to bypass Gradio client window issues...');
    console.log('HF_TOKEN present:', !!hfToken);
    console.log('Buffer length:', audioBuffer.length);

    // Try direct API call to CleanSong
    const base64Audio = audioBuffer.toString('base64');
    console.log('Created base64 audio, length:', base64Audio.length);

    console.log('=== TRYING DIFFERENT ENDPOINTS ===');
    
    // Try the main CleanSong endpoint
    const cleanSongUrl = 'https://cleansong-lyric-cleaner.hf.space/';
    console.log('--- Trying endpoint:', cleanSongUrl, '---');

    const response = await fetch(cleanSongUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [base64Audio],
        fn_index: 0
      })
    });

    console.log('Response status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ SUCCESS with', cleanSongUrl, '!');
      console.log('Result keys:', Object.keys(result));
      
      return res.status(200).json({
        success: true,
        result: result,
        endpoint: cleanSongUrl
      });
    } else {
      console.log('❌ Failed with', cleanSongUrl, '- Status:', response.status);
      const errorText = await response.text();
      console.log('Error response:', errorText.substring(0, 200));
      
      // Try alternative endpoints
      const alternativeEndpoints = [
        'https://cleansong-lyric-cleaner.hf.space/run/predict',
        'https://cleansong-lyric-cleaner.hf.space/api/predict/',
        'https://cleansong-lyric-cleaner.hf.space/api/v1/predict'
      ];

      for (const endpoint of alternativeEndpoints) {
        console.log('--- Trying alternative endpoint:', endpoint, '---');
        
        try {
          const altResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: [base64Audio],
              fn_index: 0
            })
          });

          console.log('Alternative response status:', altResponse.status);
          
          if (altResponse.ok) {
            const altResult = await altResponse.json();
            console.log('✅ SUCCESS with alternative endpoint:', endpoint, '!');
            
            return res.status(200).json({
              success: true,
              result: altResult,
              endpoint: endpoint
            });
          } else {
            console.log('❌ Failed with alternative endpoint:', endpoint);
          }
        } catch (altError) {
          console.log('❌ Error with alternative endpoint:', endpoint, '-', altError.message);
        }
      }

      return res.status(500).json({
        error: 'All endpoints failed',
        details: `Main endpoint failed with status ${response.status}: ${errorText.substring(0, 200)}`,
        triedEndpoints: [cleanSongUrl, ...alternativeEndpoints]
      });
    }

  } catch (error) {
    console.error('Error processing audio:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}

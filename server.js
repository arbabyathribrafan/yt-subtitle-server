const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    try {
        console.log(`\n--- Fetching Subtitles for: ${videoId} ---`);
        console.log(`Disguising server as a Samsung Smart TV...`);

        // ইউটিউবকে বোকা বানানোর জন্য Smart TV এর স্পেশাল পেলোড
        const payload = {
            context: {
                client: {
                    clientName: "TVHTML5", // Smart TV Client
                    clientVersion: "7.20240509.00.00",
                    clientScreen: "WATCH",
                    hl: "en",
                    gl: "US"
                }
            },
            videoId: videoId
        };

        // সরাসরি ইউটিউবের ইন্টারনাল API তে রিকোয়েস্ট (কোনো প্রক্সি ছাড়া)
        const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Samsung Smart TV এর User-Agent
                'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 NativeTVAds Safari/538.1'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`YouTube TV API Blocked Request: HTTP ${response.status}`);
        }

        const data = await response.json();

        // সাবটাইটেল ট্র্যাকগুলো বের করা
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!tracks || tracks.length === 0) {
            throw new Error("No English captions found for this video.");
        }

        // ইংরেজি সাবটাইটেল ট্র্যাকটি খুঁজে বের করা
        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind); // ম্যানুয়াল
        if (!targetTrack) targetTrack = tracks.find(t => t.languageCode.includes('en')); // অটো-জেনারেটেড
        if (!targetTrack) targetTrack = tracks[0]; // না পেলে প্রথমটি

        console.log(`Subtitle track found! Downloading XML...`);

        // সাবটাইটেলের আসল XML ফাইলটি ডাউনলোড করা
        const xmlResponse = await fetch(targetTrack.baseUrl);
        if (!xmlResponse.ok) throw new Error("Failed to download subtitle XML file.");
        
        const xmlText = await xmlResponse.text();

        // XML থেকে ফ্রন্টএন্ড এর জন্য JSON তৈরি করা
        const transcript = [];
        const textRegex = /<text start="([^"]*)"(?: dur="([^"]*)")?[^>]*>(.*?)<\/text>/g;
        let textMatch;

        while ((textMatch = textRegex.exec(xmlText)) !== null) {
            const start = parseFloat(textMatch[1]);
            const dur = textMatch[2] ? parseFloat(textMatch[2]) : 2.0;
            
            // HTML ট্যাগ এবং স্পেশাল ক্যারেক্টার রিমুভ করা
            let text = textMatch[3]
                .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/\n/g, ' ').replace(/<[^>]*>?/gm, '').trim();

            // ASCII কোড (যেমন &#39;) ডিকোড করা
            text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

            if (text) {
                transcript.push({ start, end: start + dur, en: text });
            }
        }

        if (transcript.length === 0) {
            throw new Error("Transcript file is empty.");
        }

        console.log(`[✔] Success! Sent ${transcript.length} lines to frontend.`);
        res.json(transcript);

    } catch (error) {
        console.error(`[X] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Smart TV Bypass Server running on port ${PORT}`);
});

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    try {
        // ইউটিউবকে বোকা বানানোর জন্য লেটেস্ট iPhone 15 / iOS 17 এর পেলোড
        const payload = {
            context: {
                client: {
                    clientName: "IOS",
                    clientVersion: "19.29.1",
                    deviceMake: "Apple",
                    deviceModel: "iPhone16,2",
                    osName: "iOS",
                    osVersion: "17.5.1",
                    hl: "en",
                    gl: "US"
                }
            },
            videoId: videoId
        };

        const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
                'X-YouTube-Client-Name': '5',
                'X-YouTube-Client-Version': '19.29.1'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!tracks || tracks.length === 0) throw new Error("No captions found.");

        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || 
                          tracks.find(t => t.languageCode.includes('en')) || tracks[0];

        const xmlRes = await fetch(targetTrack.baseUrl);
        if (!xmlRes.ok) throw new Error("XML download failed.");
        
        const xmlText = await xmlRes.text();
        
        const transcript = [];
        const textRegex = /<text start="([^"]*)"(?: dur="([^"]*)")?[^>]*>(.*?)<\/text>/g;
        let textMatch;
        while ((textMatch = textRegex.exec(xmlText)) !== null) {
            const start = parseFloat(textMatch[1]);
            const dur = textMatch[2] ? parseFloat(textMatch[2]) : 2.0;
            let text = textMatch[3].replace(/<[^>]*>?/gm, '').trim();
            
            text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                       .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));
            
            if (text) transcript.push({ start, end: start + dur, en: text });
        }

        res.json(transcript);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`iOS Bypass Server running on port ${PORT}`));

const express = require('express');
const cors = require('cors');

const app = express();

// সব ওয়েবসাইটের জন্য CORS পারমিশন দেওয়া হলো
app.use(cors());

// সাবটাইটেল বের করার API Endpoint
app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    
    if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
    }

    try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        // ইউটিউব পেজ ফেচ করা
        const response = await fetch(ytUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await response.text();

        // HTML থেকে হিডেন ক্যাপশন ট্র্যাক বের করা
        const regex = /"captionTracks":\[(.*?)\]/;
        const match = regex.exec(html);
        if (!match) {
            return res.status(404).json({ error: 'No captions found for this video' });
        }

        const tracks = JSON.parse(`[${match[1]}]`);
        
        // ইংরেজি সাবটাইটেল খোঁজা
        const enTrack = tracks.find(t => t.languageCode === 'en' || t.vssId.includes('.en')) || tracks[0];

        if (!enTrack) {
            return res.status(404).json({ error: 'No valid track found' });
        }

        // XML ফরম্যাটে সাবটাইটেল ডাউনলোড
        const xmlResponse = await fetch(enTrack.baseUrl);
        const xmlText = await xmlResponse.text();

        const transcript = [];
        // XML পার্স করার জন্য Regex
        const textRegex = /<text start="([^"]*)"(?: dur="([^"]*)")?[^>]*>(.*?)<\/text>/g;
        let textMatch;

        while ((textMatch = textRegex.exec(xmlText)) !== null) {
            const start = parseFloat(textMatch[1]);
            const dur = textMatch[2] ? parseFloat(textMatch[2]) : 2.0;
            let text = textMatch[3];
            
            // HTML Entity ডিকোড করা
            text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n/g, ' ').replace(/<[^>]*>?/gm, '').trim();
            
            if (text) {
                transcript.push({
                    start,
                    end: start + dur,
                    en: text
                });
            }
        }

        // সফল হলে JSON রেসপন্স পাঠানো
        res.json(transcript);

    } catch (error) {
        console.error('Error fetching transcript:', error);
        res.status(500).json({ error: 'Failed to fetch transcript from YouTube' });
    }
});

// সার্ভার চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`yt-subtitle-server is running on port ${PORT}`);
});

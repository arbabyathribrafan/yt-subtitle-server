const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Render.com এর IP Block এড়ানোর জন্য ৩টি শক্তিশালী ফ্রি প্রক্সি নেটওয়ার্ক
    const fetchUrls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(ytUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(ytUrl)}`,
        ytUrl // ৩য় অপশন হিসেবে সরাসরি চেষ্টা করবে
    ];

    let html = "";
    let lastError = "";

    // একটি প্রক্সি কাজ না করলে নিজে থেকেই পরেরটিতে চেষ্টা করবে
    for (const url of fetchUrls) {
        try {
            console.log(`Fetching from Proxy...`);
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0' }
            });
            
            if (response.ok) {
                const text = await response.text();
                // পেজটি যে ইউটিউবের আসল পেজ (কোনো এরর পেজ নয়), তা নিশ্চিত করা হচ্ছে
                if (text.includes('playabilityStatus') || text.includes('captionTracks')) {
                    html = text;
                    console.log(`Successfully fetched HTML!`);
                    break; // সফল হলে লুপ বন্ধ করে দেবে
                }
            }
        } catch (err) {
            lastError = err.message;
        }
    }

    if (!html) {
        return res.status(500).json({ error: `YouTube Blocked the Request. Try again in a minute.` });
    }

    try {
        // HTML থেকে সাবটাইটেল ডেটাবেস বের করা
        const match = html.match(/"captions":({.*?}),"videoDetails"/);
        if (!match) throw new Error('No captions found for this video.');

        const captionsData = JSON.parse(match[1]);
        const tracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks || [];

        if (tracks.length === 0) throw new Error('No caption tracks available.');

        // ইংরেজি ভাষার সাবটাইটেল ট্র্যাক খোঁজা
        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || 
                          tracks.find(t => t.languageCode.includes('en')) || 
                          tracks[0];

        // সাবটাইটেল (XML) ফাইলটি সরাসরি Google এর CDN সার্ভার থেকে ডাউনলোড
        const xmlResponse = await fetch(targetTrack.baseUrl);
        if (!xmlResponse.ok) throw new Error('Failed to fetch XML file from Google servers.');
        
        const xmlText = await xmlResponse.text();

        // XML থেকে ফ্রন্টএন্ড এর জন্য ডেটা সাজানো
        const transcript = [];
        const textRegex = /<text start="([^"]*)"(?: dur="([^"]*)")?[^>]*>(.*?)<\/text>/g;
        let textMatch;

        while ((textMatch = textRegex.exec(xmlText)) !== null) {
            const start = parseFloat(textMatch[1]);
            const dur = textMatch[2] ? parseFloat(textMatch[2]) : 2.0;
            
            // অপ্রয়োজনীয় ট্যাগ ও কোড মুছে পরিষ্কার টেক্সট বানানো
            let text = textMatch[3]
                .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/\n/g, ' ').replace(/<[^>]*>?/gm, '').trim();

            text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

            if (text) {
                transcript.push({ start, end: start + dur, en: text });
            }
        }

        if (transcript.length === 0) throw new Error('Parsed transcript is empty.');
        
        // সফলভাবে ফ্রন্টএন্ডে ডেটা পাঠানো হলো
        res.json(transcript);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy Server running on port ${PORT}`));

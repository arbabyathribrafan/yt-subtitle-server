const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // আসল ব্রাউজারের মতো রিকোয়েস্ট পাঠানো এবং Consent Page বাইপাস করা
        const response = await fetch(ytUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+999' // YouTube Cookie Consent Bypass
            }
        });

        if (!response.ok) {
            throw new Error(`YouTube Server Responded with Status: ${response.status}`);
        }

        const html = await response.text();

        // HTML থেকে সাবটাইটেলের ডাটাবেস (JSON) খুঁজে বের করা
        const match = html.match(/"captions":({.*?}),"videoDetails"/);
        let tracks = [];

        if (match) {
            const captionsJson = JSON.parse(match[1]);
            tracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks || [];
        } else {
            // Fallback Regex (যদি ইউটিউব ডিজাইন পরিবর্তন করে)
            const fallbackMatch = html.match(/"captionTracks":\[(.*?)\]/);
            if (!fallbackMatch) throw new Error('YouTube Blocked the Server IP or No Captions Found.');
            tracks = JSON.parse(`[${fallbackMatch[1]}]`);
        }

        if (tracks.length === 0) throw new Error('No caption tracks available for this video.');

        // ইংরেজি সাবটাইটেল খোঁজা (প্রথমে ম্যানুয়াল, না পেলে অটো-জেনারেটেড)
        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind);
        if (!targetTrack) targetTrack = tracks.find(t => t.languageCode.includes('en'));
        if (!targetTrack) throw new Error('No English subtitle track found.');

        // XML ডাটা ফেচ করা
        const xmlResponse = await fetch(targetTrack.baseUrl);
        const xmlText = await xmlResponse.text();

        // XML থেকে টেক্সট ও সময় আলাদা করা
        const transcript = [];
        const textRegex = /<text start="([^"]*)"(?: dur="([^"]*)")?[^>]*>(.*?)<\/text>/g;
        let textMatch;

        while ((textMatch = textRegex.exec(xmlText)) !== null) {
            const start = parseFloat(textMatch[1]);
            const dur = textMatch[2] ? parseFloat(textMatch[2]) : 2.0;
            let text = textMatch[3]
                .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/\n/g, ' ').replace(/<[^>]*>?/gm, '').trim();
            
            // ডিকোড এইচটিএমএল এন্টিটি (যেমন: &#39; কে ' বানানো)
            text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

            if (text) {
                transcript.push({ start, end: start + dur, en: text });
            }
        }

        res.json(transcript);

    } catch (error) {
        console.error('Server Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

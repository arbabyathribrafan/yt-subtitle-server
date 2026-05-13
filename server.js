const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    try {
        console.log(`Fetching subtitles for: ${videoId} via Android API`);

        // ইউটিউবকে বোঝানো হচ্ছে যে এটি একটি অ্যান্ড্রয়েড মোবাইল অ্যাপ থেকে আসা রিকোয়েস্ট
        const payload = {
            context: {
                client: {
                    clientName: "ANDROID",
                    clientVersion: "17.31.35",
                    androidSdkVersion: 31,
                    userAgent: "com.google.android.youtube/17.31.35 (Linux; U; Android 12; GB) gzip"
                }
            },
            videoId: videoId
        };

        // সরাসরি ইউটিউবের ইন্টারনাল API তে POST রিকোয়েস্ট
        const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`YouTube API returned HTTP ${response.status}`);

        const data = await response.json();

        // সাবটাইটেল ট্র্যাকগুলো বের করা
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!tracks || tracks.length === 0) {
            throw new Error("No subtitles found for this video.");
        }

        // ইংরেজি সাবটাইটেল খোঁজা
        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind); // ম্যানুয়াল ইংরেজি
        if (!targetTrack) targetTrack = tracks.find(t => t.languageCode.includes('en')); // অটো-জেনারেটেড ইংরেজি
        if (!targetTrack) targetTrack = tracks[0]; // না পেলে প্রথমটি

        // সাবটাইটেলের আসল XML ফাইল ডাউনলোড
        const xmlResponse = await fetch(targetTrack.baseUrl);
        if (!xmlResponse.ok) throw new Error("Failed to download XML subtitle data.");
        
        const xmlText = await xmlResponse.text();

        // XML পার্স করে ফ্রন্টএন্ডের জন্য JSON তৈরি করা
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

            // HTML Entity ডিকোড (যেমন &#39; কে ')
            text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

            if (text) {
                transcript.push({ start, end: start + dur, en: text });
            }
        }

        if (transcript.length === 0) throw new Error("Transcript parsed but is empty.");

        // সফল হলে ডাটা পাঠানো
        res.json(transcript);

    } catch (error) {
        console.error('Backend Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`YT Subtitle Server running on port ${PORT}`);
});

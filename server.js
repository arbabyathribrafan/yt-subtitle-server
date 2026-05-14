const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    console.log(`\n--- Fetching Subtitles for: ${videoId} ---`);

    try {
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const encodedUrl = encodeURIComponent(ytUrl);

        // Render এর IP Block এড়ানোর জন্য বিশ্বস্ত প্রক্সি সার্ভার লিস্ট
        const proxies = [
            `https://api.allorigins.win/get?url=${encodedUrl}`, // Method 1: AllOrigins API
            `https://api.codetabs.com/v1/proxy?quest=${ytUrl}`  // Method 2: CodeTabs Proxy
        ];

        let html = null;

        // প্রক্সি দিয়ে ইউটিউবের HTML পেজটি চুরি করে আনা
        for (const proxy of proxies) {
            console.log(`Trying Proxy: ${proxy.split('/')[2]}`);
            try {
                const response = await fetch(proxy, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' }
                });

                if (!response.ok) continue;

                let textData = "";
                // AllOrigins JSON ফরম্যাটে ডেটা দেয়, তাই সেভাবে পার্স করা
                if (proxy.includes('allorigins')) {
                    const jsonData = await response.json();
                    textData = jsonData.contents;
                } else {
                    textData = await response.text();
                }

                // চেক করা যে আসল ইউটিউবের পেজ এসেছে কিনা (যেখানে ক্যাপশন আছে)
                if (textData && textData.includes('"captionTracks"')) {
                    html = textData;
                    console.log(`[✔] HTML fetched successfully via Proxy!`);
                    break;
                }
            } catch (e) {
                console.log(`[X] Proxy failed.`);
            }
        }

        // যদি প্রক্সিগুলোও ফেইল করে (যা সাধারণত হয় না)
        if (!html) {
            throw new Error("Proxies failed to bypass YouTube block. Try again later.");
        }

        // HTML থেকে সাবটাইটেল এর আসল লিংক (JSON) বের করা
        const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
        if (!captionMatch) {
            throw new Error("No English captions found for this video.");
        }

        const tracks = JSON.parse(captionMatch[1]);

        // ইংরেজি সাবটাইটেল ট্র্যাকটি খোঁজা
        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || // ম্যানুয়াল
                          tracks.find(t => t.languageCode.includes('en')) || // অটো-জেনারেটেড
                          tracks[0];

        if (!targetTrack || !targetTrack.baseUrl) {
            throw new Error("Subtitle download URL missing.");
        }

        console.log(`Downloading XML Subtitle file...`);
        
        // সাবটাইটেল ফাইলটি সরাসরি Google CDN থেকে ডাউনলোড করা (CDN কখনো IP ব্লক করে না)
        const xmlRes = await fetch(targetTrack.baseUrl);
        if (!xmlRes.ok) throw new Error("Failed to download subtitle XML from Google CDN.");

        const xmlText = await xmlRes.text();

        // XML ফাইলকে আপনার ফ্রন্টএন্ড এর জন্য JSON এ কনভার্ট করা
        const transcript = [];
        const textRegex = /<text start="([^"]*)"(?: dur="([^"]*)")?[^>]*>(.*?)<\/text>/g;
        let textMatch;

        while ((textMatch = textRegex.exec(xmlText)) !== null) {
            const start = parseFloat(textMatch[1]);
            const dur = textMatch[2] ? parseFloat(textMatch[2]) : 2.0;
            
            // HTML ট্যাগ এবং অপ্রয়োজনীয় ব্র্যাকেট রিমুভ করা
            let text = textMatch[3].replace(/<[^>]*>?/gm, '').trim();

            text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                       .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

            if (text) transcript.push({ start, end: start + dur, en: text });
        }

        if (transcript.length === 0) throw new Error("Transcript was parsed but it's empty.");

        console.log(`[✔] Success! Sent ${transcript.length} lines to frontend.`);
        res.json(transcript);

    } catch (error) {
        console.error(`[FATAL] ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ultimate Proxy-Scraper running on port ${PORT}`);
});

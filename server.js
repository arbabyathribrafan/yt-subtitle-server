const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// XML কে JSON-এ কনভার্ট করার ফাংশন
function parseXmlToJSON(xmlText) {
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

        // ASCII কোড (যেমন &#39; কে ' বানানো) ডিকোড করা
        text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

        if (text) {
            transcript.push({ start, end: start + dur, en: text });
        }
    }
    return transcript;
}

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    try {
        console.log(`\n--- [Method 1] Dedicated Transcript API for: ${videoId} ---`);
        
        // ১. প্রথম চেষ্টা: Dedicated Subtitle Server (এটি Render এর IP Block বাইপাস করবে)
        const response1 = await fetch(`https://youtubetranscript.com/?server_vid2=${videoId}`);
        if (!response1.ok) throw new Error("Dedicated API HTTP Error");
        
        const xmlText1 = await response1.text();
        
        // যদি সফলভাবে XML সাবটাইটেল আসে
        if (xmlText1.includes('<text start=')) {
            const transcript = parseXmlToJSON(xmlText1);
            if (transcript.length > 0) {
                console.log(`[✔] Success with Method 1! Sent to frontend.`);
                return res.json(transcript); // ফ্রন্টএন্ডে ডেটা পাঠানো
            }
        }
        
        throw new Error("Method 1 returned empty or blocked data.");

    } catch (err1) {
        console.log(`[X] Method 1 Failed: ${err1.message}. Shifting to Method 2...`);
        
        try {
            console.log(`--- [Method 2] Latest Android API Bypass ---`);
            
            // ২. দ্বিতীয় চেষ্টা: Latest Android Client (V19) - এটি 400 Bad Request এড়াবে
            const payload = {
                context: {
                    client: {
                        clientName: "ANDROID",
                        clientVersion: "19.30.36", // ইউটিউবের লেটেস্ট অ্যান্ড্রয়েড ভার্সন
                        androidSdkVersion: 33,
                        osName: "Android",
                        osVersion: "13"
                    }
                },
                videoId: videoId
            };

            const response2 = await fetch('https://www.youtube.com/youtubei/v1/player', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response2.ok) throw new Error(`Android API Blocked: HTTP ${response2.status}`);

            const data = await response2.json();
            const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

            if (!tracks || tracks.length === 0) {
                throw new Error("No English captions available for this video.");
            }

            // ইংরেজি সাবটাইটেল খোঁজা
            let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || 
                              tracks.find(t => t.languageCode.includes('en')) || 
                              tracks[0];

            // সাবটাইটেল ডাউনলোড করা
            const xmlResponse = await fetch(targetTrack.baseUrl);
            if (!xmlResponse.ok) throw new Error("Failed to download XML file.");
            
            const xmlText2 = await xmlResponse.text();
            const transcript = parseXmlToJSON(xmlText2);
            
            if (transcript.length > 0) {
                console.log(`[✔] Success with Method 2! Sent to frontend.`);
                return res.json(transcript);
            }

            throw new Error("Method 2 parsed an empty transcript.");

        } catch (err2) {
            console.error(`[FATAL] Both Methods Failed.`);
            // ফ্রন্টএন্ডে সুন্দরভাবে এরর মেসেজ পাঠানো
            res.status(500).json({ error: `Could not fetch subtitles. M1: ${err1.message} | M2: ${err2.message}` });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ultimate Subtitle Server running on port ${PORT}`);
});

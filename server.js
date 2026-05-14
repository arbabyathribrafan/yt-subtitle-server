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
        let text = textMatch[3].replace(/<[^>]*>?/gm, '').trim();
        
        // HTML Entity ডিকোড করা
        text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
                   .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        text = text.replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec));

        if (text) transcript.push({ start, end: start + dur, en: text });
    }
    return transcript;
}

// VTT টাইমকে সেকেন্ডে কনভার্ট করার ফাংশন
function timeToSec(t) {
    if (!t) return 0;
    const p = t.split(':');
    if (p.length === 3) return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]);
    if (p.length === 2) return parseInt(p[0]) * 60 + parseFloat(p[1]);
    return 0;
}

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    console.log(`\n--- Fetching Subtitles for: ${videoId} ---`);
    let finalTranscript = [];

    // 🟢 Method 1: GoogleBot Disguise (সরাসরি ইউটিউব থেকে, গুগল সেজে)
    try {
        console.log(`[Method 1] Direct fetch using GoogleBot disguise...`);
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        const ytRes = await fetch(ytUrl, {
            headers: {
                // ইউটিউব ভাববে এটি গুগলের রোবট, তাই কোনো ব্লক করবে না
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        if (!ytRes.ok) throw new Error(`HTTP ${ytRes.status}`);
        const html = await ytRes.text();

        // ইউটিউবের ইন্টারনাল ডেটাবেস থেকে সাবটাইটেল লিংক বের করা
        const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+meta|<\/script|\n)/);
        if (!match) throw new Error("Could not find player response in HTML.");

        const data = JSON.parse(match[1]);
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (!tracks || tracks.length === 0) throw new Error("No captions found in player response.");

        // ইংরেজি সাবটাইটেল খোঁজা
        let targetTrack = tracks.find(t => t.languageCode === 'en' && !t.kind) || 
                          tracks.find(t => t.languageCode.includes('en')) || tracks[0];

        // সাবটাইটেল ডাউনলোড
        const xmlRes = await fetch(targetTrack.baseUrl);
        if (!xmlRes.ok) throw new Error("Failed to download XML from Google CDN.");

        const xmlText = await xmlRes.text();
        finalTranscript = parseXmlToJSON(xmlText);

        if (finalTranscript.length > 0) {
            console.log(`[✔] Method 1 (GoogleBot) Succeeded!`);
            return res.json(finalTranscript);
        }
    } catch (err1) {
        console.log(`[X] Method 1 Failed: ${err1.message}`);
    }

    // 🟡 Method 2: Third-Party API (ফেক এরর চেকিং সহ)
    try {
        console.log(`[Method 2] Dedicated Transcript API...`);
        const res2 = await fetch(`https://youtubetranscript.com/?server_vid2=${videoId}`);
        const xmlText2 = await res2.text();

        // 🚨 আগে যে সমস্যাটি হয়েছিল, সেটি এখানে ব্লক করা হলো!
        if (xmlText2.includes("YouTube is currently blocking us") || !xmlText2.includes("<text start=")) {
            throw new Error("API returned fake error message or invalid XML.");
        }

        finalTranscript = parseXmlToJSON(xmlText2);
        if (finalTranscript.length > 0) {
            console.log(`[✔] Method 2 Succeeded!`);
            return res.json(finalTranscript);
        }
    } catch (err2) {
        console.log(`[X] Method 2 Failed: ${err2.message}`);
    }

    // 🔴 Method 3: Yewtu.be Bypass (ইউটিউবের সবচেয়ে শক্তিশালী প্রক্সি)
    try {
        console.log(`[Method 3] Yewtu.be Bypass...`);
        const res3 = await fetch(`https://yewtu.be/api/v1/videos/${videoId}`);
        if (!res3.ok) throw new Error(`Yewtu.be HTTP ${res3.status}`);

        const data3 = await res3.json();
        if (!data3.captions || data3.captions.length === 0) throw new Error("No captions on Yewtu.be");

        let caption = data3.captions.find(c => c.languageCode === 'en' && !c.label.toLowerCase().includes('auto')) || 
                      data3.captions.find(c => c.languageCode.includes('en')) || data3.captions[0];

        const vttRes = await fetch("https://yewtu.be" + caption.url);
        if (!vttRes.ok) throw new Error("Failed to download VTT");

        const vttText = await vttRes.text();
        const lines = vttText.split('\n');
        let currentStart = 0, currentEnd = 0, currentText = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.includes('-->')) {
                const parts = line.split(/\s+-->\s+/);
                currentStart = timeToSec(parts[0]);
                currentEnd = timeToSec(parts[1].split(/\s+/)[0]);
                currentText = [];
            } else if (line === '' && currentText.length > 0) {
                let text = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
                text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                if (text) finalTranscript.push({ start: currentStart, end: currentEnd, en: text });
                currentText = [];
            } else if (line !== 'WEBVTT' && line !== '' && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
                currentText.push(line);
            }
        }

        if (finalTranscript.length > 0) {
            console.log(`[✔] Method 3 (Yewtu.be) Succeeded!`);
            return res.json(finalTranscript);
        }
    } catch (err3) {
        console.log(`[X] Method 3 Failed: ${err3.message}`);
    }

    // সব ফেইল করলে আসল এরর মেসেজ দেখাবে
    console.error(`[FATAL] All 3 methods failed.`);
    res.status(500).json({ error: `YouTube completely blocked the request. Please try another video.` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Triple-Layer Server running on port ${PORT}`);
});

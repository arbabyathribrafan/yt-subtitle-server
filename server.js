const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');
const { getSubtitles } = require('youtube-captions-scraper');
const translate = require('google-translate-api-x');

const app = express();
app.use(cors());

// সাবটাইটেল বের করা এবং বাংলা করার API
app.get('/api/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: "Video ID is required" });

    let rawSubtitles = [];

    // সিস্টেম ১: প্রথমে অটো-জেনারেটেড ট্রাই করবে
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        rawSubtitles = transcript.map(t => ({
            start: t.offset,
            dur: t.duration,
            text: t.text
        }));
    } catch (err1) {
        // সিস্টেম ২: সিস্টেম ১ ফেইল করলে ম্যানুয়াল ট্রাই করবে
        try {
            rawSubtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
        } catch (err2) {
            return res.status(500).json({ error: "ভিডিওটিতে কোনো সাবটাইটেল নেই বা ইউটিউব সার্ভার ব্লক করেছে।" });
        }
    }

    // প্রথম ৫০টি লাইন নিচ্ছি
    const limit = Math.min(rawSubtitles.length, 50);
    let processedData = [];
    let englishLines = [];

    for (let i = 0; i < limit; i++) {
        let enText = rawSubtitles[i].text.replace(/\n/g, ' ').trim();
        enText = enText.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        englishLines.push(enText || "...");
    }

    // গুগলকে ট্রান্সলেট করতে পাঠানো
    let combinedText = englishLines.join('\n');
    let translatedText = "";
    let translationFailed = false;
    
    try {
        let translated = await translate(combinedText, { to: 'bn' });
        translatedText = translated.text;
    } catch (tError) {
        translationFailed = true; // গুগল ব্লক করলে এই অপশন চালু হবে
    }

    let bengaliLines = translationFailed ? [] : translatedText.split('\n');

    // ডাটা সাজানো
    for (let i = 0; i < limit; i++) {
        let startSec = parseFloat(rawSubtitles[i].start);
        let durSec = parseFloat(rawSubtitles[i].dur);
        
        // মিলি-সেকেন্ড ফিক্স
        if (startSec > 1000) { startSec /= 1000; durSec /= 1000; }

        processedData.push({
            start: startSec,
            end: startSec + durSec,
            en: englishLines[i],
            bn: translationFailed ? "(গুগল ট্রান্সলেটর সাময়িক ব্লক করেছে)" : (bengaliLines[i] ? bengaliLines[i].trim() : "")
        });
    }

    res.json(processedData);
});

// শব্দের অর্থ বের করার API
app.get('/api/translate', async (req, res) => {
    const text = req.query.text;
    try {
        let translated = await translate(text, { to: 'bn' });
        res.json({ word: text, meaning: translated.text });
    } catch (error) {
        res.status(500).json({ error: "Meaning not found" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

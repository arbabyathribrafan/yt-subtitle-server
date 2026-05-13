const express = require('express');
const cors = require('cors');
const { getSubtitles } = require('youtube-captions-scraper');
const translate = require('google-translate-api-x');

const app = express();
app.use(cors());

// ১. সাবটাইটেল বের করা এবং বাংলা করার API
app.get('/api/transcript', async (req, res) => {
    const videoId = req.query.videoId;

    if (!videoId) {
        return res.status(400).json({ error: "Video ID is required" });
    }

    try {
        // ইউটিউব থেকে ইংরেজি সাবটাইটেল আনা
        const subtitles = await getSubtitles({
            videoID: videoId,
            lang: 'en' 
        });

        // প্রথম ৫০টি লাইন নিচ্ছি
        const limit = Math.min(subtitles.length, 50);
        let processedData = [];
        let englishLines = [];

        // ইংরেজি লাইনগুলো একসাথে করা
        for (let i = 0; i < limit; i++) {
            let enText = subtitles[i].text.replace(/\n/g, ' ').trim();
            englishLines.push(enText || "...");
        }

        // গুগলকে মাত্র ১টি রিকোয়েস্ট পাঠিয়ে সব বাংলা করা (Rate limit থেকে বাঁচতে)
        let combinedText = englishLines.join('\n');
        let translatedText = "";
        
        try {
            let translated = await translate(combinedText, { to: 'bn' });
            translatedText = translated.text;
        } catch (tError) {
            console.log("Translation Blocked by Google, using English fallback.");
            translatedText = combinedText; // ট্রান্সলেট ফেইল করলে শুধু ইংরেজি দেখাবে
        }

        let bengaliLines = translatedText.split('\n');

        // ইংরেজি ও বাংলা লাইন একসাথে সাজানো
        for (let i = 0; i < limit; i++) {
            processedData.push({
                start: parseFloat(subtitles[i].start),
                end: parseFloat(subtitles[i].start) + parseFloat(subtitles[i].dur),
                en: englishLines[i],
                bn: bengaliLines[i] ? bengaliLines[i].trim() : "অনুবাদ করা যায়নি"
            });
        }

        res.json(processedData);

    } catch (error) {
        res.status(500).json({ error: "এই ভিডিওতে কোনো ইংরেজি সাবটাইটেল নেই বা অটো-জেনারেটেড।" });
    }
});

// ২. সিঙ্গেল শব্দের বাংলা অর্থ বের করার API
app.get('/api/translate', async (req, res) => {
    const text = req.query.text;
    try {
        let translated = await translate(text, { to: 'bn' });
        res.json({ word: text, meaning: translated.text });
    } catch (error) {
        res.status(500).json({ error: "Meaning not found" });
    }
});

// সার্ভার চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

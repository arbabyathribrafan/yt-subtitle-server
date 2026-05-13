const express = require('express');
const cors = require('cors');
const { getSubtitles } = require('youtube-captions-scraper');
const translate = require('google-translate-api-x');

const app = express();
app.use(cors()); // যেকোনো ওয়েবসাইট থেকে রিকোয়েস্ট অ্যালাও করার জন্য

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

        // ফ্রি সার্ভার যেন ওভারলোড না হয়, তাই প্রথম ৫০টি লাইন ট্রান্সলেট করছি 
        // (আপনি চাইলে limit তুলে দিতে পারেন, তবে একটু সময় বেশি লাগবে)
        const limit = Math.min(subtitles.length, 50);
        let processedData = [];

        for (let i = 0; i < limit; i++) {
            let line = subtitles[i];
            let enText = line.text.replace(/\n/g, ' '); // লাইন ব্রেক সরানো
            
            // গুগল ট্রান্সলেটর দিয়ে বাংলা করা
            let translated = await translate(enText, { to: 'bn' });

            processedData.push({
                start: parseFloat(line.start),
                end: parseFloat(line.start) + parseFloat(line.dur),
                en: enText,
                bn: translated.text
            });
        }

        res.json(processedData);

    } catch (error) {
        res.status(500).json({ error: "এই ভিডিওতে কোনো ইংরেজি সাবটাইটেল নেই বা ট্রান্সলেট করা যায়নি।" });
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
const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');
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
        // নতুন লাইব্রেরি: অটো-জেনারেটেড এবং ম্যানুয়াল সব সাবটাইটেল ধরবে
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);

        // প্রথম ৫০টি লাইন নিচ্ছি
        const limit = Math.min(transcript.length, 50);
        let processedData = [];
        let englishLines = [];

        for (let i = 0; i < limit; i++) {
            let enText = transcript[i].text.replace(/\n/g, ' ').trim();
            // HTML স্পেশাল ক্যারেক্টার ফিক্স করা
            enText = enText.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            englishLines.push(enText || "...");
        }

        // গুগলকে মাত্র ১টি রিকোয়েস্ট পাঠিয়ে সব বাংলা করা
        let combinedText = englishLines.join('\n');
        let translatedText = "";
        
        try {
            let translated = await translate(combinedText, { to: 'bn' });
            translatedText = translated.text;
        } catch (tError) {
            console.log("Translation Error:", tError.message);
            translatedText = combinedText; // ফেইল করলে শুধু ইংরেজি দেখাবে
        }

        let bengaliLines = translatedText.split('\n');

        // ইংরেজি ও বাংলা লাইন একসাথে সাজানো
        for (let i = 0; i < limit; i++) {
            let startSec = parseFloat(transcript[i].offset);
            let durSec = parseFloat(transcript[i].duration);
            
            // যদি মিলি-সেকেন্ডে আসে তবে সেকেন্ডে কনভার্ট করা
            if (startSec > 10000) {
                startSec = startSec / 1000;
                durSec = durSec / 1000;
            }

            processedData.push({
                start: startSec,
                end: startSec + durSec,
                en: englishLines[i],
                bn: bengaliLines[i] ? bengaliLines[i].trim() : "অনুবাদ করা যায়নি"
            });
        }

        res.json(processedData);

    } catch (error) {
        console.error("Subtitle Fetch Error:", error.message);
        res.status(500).json({ error: "সাবটাইটেল টানা সম্ভব হয়নি! ভিডিওটিতে কোনো সাবটাইটেল নেই।" });
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

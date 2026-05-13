const express = require('express');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();

// সব ওয়েবসাইটের জন্য CORS পারমিশন দেওয়া হলো
app.use(cors());

// সাবটাইটেল বের করার API Endpoint
app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    
    if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
    }

    try {
        console.log(`Fetching transcript for video: ${videoId}`);
        
        // youtube-transcript প্যাকেজ ব্যবহার করে সাবটাইটেল ফেচ করা
        const transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
        
        if (!transcriptList || transcriptList.length === 0) {
            return res.status(404).json({ error: 'No captions found' });
        }

        // ফ্রন্টএন্ড এর কাঙ্ক্ষিত ফরম্যাটে ডেটা সাজানো
        const formattedTranscript = transcriptList.map(item => {
            // offset এবং duration মিলিসেকেন্ডে থাকে, তাই সেকেন্ডে কনভার্ট করা হলো
            const startSec = item.offset / 1000;
            const durSec = item.duration / 1000;
            
            // স্পেশাল ক্যারেক্টার ক্লিন করা
            let text = item.text
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/\n/g, ' ')
                .replace(/<[^>]*>?/gm, '')
                .trim();

            return {
                start: startSec,
                end: startSec + durSec,
                en: text
            };
        });

        // সফল হলে JSON রেসপন্স পাঠানো
        res.json(formattedTranscript);

    } catch (error) {
        console.error('Error fetching transcript:', error.message);
        res.status(500).json({ error: 'Failed to fetch transcript from YouTube. It might not have captions.' });
    }
});

// সার্ভার চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`yt-subtitle-server is running on port ${PORT}`);
});

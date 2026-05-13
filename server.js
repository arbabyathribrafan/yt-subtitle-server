const express = require('express');
const cors = require('cors');
const { getSubtitles } = require('youtube-captions-scraper');

const app = express();

// সব ওয়েবসাইটের জন্য CORS পারমিশন
app.use(cors());

// সাবটাইটেল বের করার API
app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    
    if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
    }

    try {
        console.log(`Fetching transcript for video: ${videoId}`);
        
        // youtube-captions-scraper ব্যবহার করে ইংরেজি সাবটাইটেল আনা
        const captions = await getSubtitles({
            videoID: videoId,
            lang: 'en' // ইংরেজি সাবটাইটেল খুঁজবে
        });

        // ফ্রন্টএন্ড এর জন্য ডেটা ফরম্যাট করা
        const formattedTranscript = captions.map(item => {
            return {
                start: parseFloat(item.start),
                end: parseFloat(item.start) + parseFloat(item.dur),
                // [Music] বা [Applause] এর মত টেক্সট রিমুভ করা এবং ক্লিন করা
                en: item.text.replace(/\[.*?\]/g, '').replace(/\n/g, ' ').trim()
            };
        }).filter(item => item.en.length > 0); // ফাকা লাইনগুলো বাদ দেওয়া

        res.json(formattedTranscript);

    } catch (error) {
        console.error('Error fetching transcript:', error.message);
        res.status(500).json({ error: 'Failed to fetch transcript. Video might not have English subtitles.' });
    }
});

// সার্ভার চালু করা
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

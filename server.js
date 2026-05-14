const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// VTT টাইম (00:00:04.500) কে সেকেন্ডে কনভার্ট করার ফাংশন
function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    let sec = 0;
    if (parts.length === 3) {
        sec = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        sec = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    }
    return sec;
}

app.get('/transcript', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    // ৫টি সুপার ফাস্ট ও রিলায়েবল Invidious API সার্ভার (IP Block এড়াতে)
    const instances = [
        'https://inv.tux.pizza',
        'https://invidious.nerdvpn.de',
        'https://invidious.jing.rocks',
        'https://invidious.fdn.fr',
        'https://vid.puffyan.us'
    ];

    let lastError = "All API instances failed";

    // একটি ফেইল করলে স্বয়ংক্রিয়ভাবে পরেরটিতে রিকোয়েস্ট পাঠাবে
    for (const instance of instances) {
        try {
            console.log(`Fetching from Invidious API: ${instance}`);
            const apiUrl = `${instance}/api/v1/videos/${videoId}`;

            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

            const data = await response.json();

            // সাবটাইটেল আছে কি না চেক করা
            if (!data.captions || data.captions.length === 0) {
                throw new Error('No captions available for this video on this server.');
            }

            // ইংরেজি সাবটাইটেল খোঁজা (ম্যানুয়ালকে অগ্রাধিকার দেওয়া হয়েছে)
            let caption = data.captions.find(c => c.languageCode === 'en' && !c.label.toLowerCase().includes('auto'));
            if (!caption) caption = data.captions.find(c => c.languageCode.includes('en'));
            if (!caption) caption = data.captions[0];

            // সাবটাইটেল (VTT ফরম্যাট) ফাইল ডাউনলোড করা
            const vttUrl = instance + caption.url;
            const vttResponse = await fetch(vttUrl);
            if (!vttResponse.ok) throw new Error('Failed to download subtitle file.');

            const vttText = await vttResponse.text();

            // VTT ফাইল পার্স করে আপনার ফ্রন্টএন্ড এর জন্য JSON বানানো
            const transcript = [];
            const lines = vttText.split('\n');
            let currentStart = 0;
            let currentEnd = 0;
            let currentText = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.includes('-->')) {
                    const timeParts = line.split(/\s+-->\s+/);
                    currentStart = timeToSeconds(timeParts[0]);
                    // টাইমলাইনের পর বাড়তি টেক্সট (যেমন align:start) থাকলে সেটা বাদ দেওয়া
                    currentEnd = timeToSeconds(timeParts[1].split(/\s+/)[0]); 
                    currentText = [];
                } 
                else if (line === '' && currentText.length > 0) {
                    let text = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
                    text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                    
                    // [Music] বা (Applause) এর মত সাউন্ড ইফেক্ট রিমুভ করা
                    text = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();

                    if (text) transcript.push({ start: currentStart, end: currentEnd, en: text });
                    currentText = [];
                } 
                else if (line !== 'WEBVTT' && line !== '' && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
                    currentText.push(line);
                }
            }

            // একদম শেষের লাইনটি ধরার জন্য
            if (currentText.length > 0) {
                let text = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
                text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                text = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
                if (text) transcript.push({ start: currentStart, end: currentEnd, en: text });
            }

            if (transcript.length > 0) {
                console.log(`Success! Subtitles fetched perfectly.`);
                return res.json(transcript); // সফল হলে ডেটা পাঠিয়ে লুপ ব্রেক করবে
            } else {
                throw new Error('Parsed transcript is empty.');
            }

        } catch (err) {
            console.log(`Failed on ${instance}: ${err.message}`);
            lastError = err.message;
        }
    }

    // সব সার্ভার ফেইল করলে এরর মেসেজ
    res.status(500).json({ error: `System Failed. Reason: ${lastError}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Invidious API Server running on port ${PORT}`);
});

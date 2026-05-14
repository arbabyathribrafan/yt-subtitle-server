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

    try {
        console.log(`\n--- Fetching Subtitles for: ${videoId} ---`);
        
        let healthyServers = [];
        
        // ১. ইন্টারনেট থেকে এই মুহূর্তের সবচেয়ে সুস্থ (Healthy) ১০টি সার্ভারের লাইভ লিস্ট আনা
        try {
            console.log(`[1] Fetching live server list...`);
            const invReq = await fetch('https://api.invidious.io/instances.json?sort_by=health');
            const invData = await invReq.json();
            
            // ফিল্টার করে সেরা ১০টি সার্ভার আলাদা করা
            healthyServers = invData
                .filter(inst => inst[1].type === 'https' && inst[1].api === true)
                .map(inst => inst[1].uri)
                .slice(0, 10);
                
        } catch (e) {
            console.log(`[!] Failed to get live list. Using backup servers...`);
            // যদি লাইভ লিস্ট আনতে না পারে, তবে ব্যাকআপ লিস্ট ব্যবহার করবে
            healthyServers = [
                'https://inv.tux.pizza', 'https://invidious.nerdvpn.de',
                'https://invidious.jing.rocks', 'https://vid.puffyan.us',
                'https://yewtu.be', 'https://invidious.lunar.icu'
            ];
        }

        console.log(`[2] Found ${healthyServers.length} active servers. Testing them rapidly...`);

        let lastError = "All servers failed.";

        // ২. এই ১০টি সার্ভারে একটার পর একটা চেষ্টা করবে
        for (const server of healthyServers) {
            try {
                console.log(` -> Testing: ${server}`);
                const apiUrl = `${server}/api/v1/videos/${videoId}`;

                // সার্ভার স্লো থাকলে ৫ সেকেন্ড পর নিজে থেকেই সেটি বাতিল করে পরেরটিতে যাবে (যাতে কোড হ্যাং না হয়)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(apiUrl, { signal: controller.signal });
                clearTimeout(timeoutId); // সফল হলে টাইমার বন্ধ

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();

                if (!data.captions || data.captions.length === 0) {
                    throw new Error('No captions on this server.');
                }

                // ইংরেজি সাবটাইটেল খোঁজা
                let caption = data.captions.find(c => c.languageCode === 'en' && !c.label.toLowerCase().includes('auto'));
                if (!caption) caption = data.captions.find(c => c.languageCode.includes('en'));
                if (!caption) caption = data.captions[0];

                const vttUrl = server + caption.url;
                
                // সাবটাইটেল ফাইল ডাউনলোডের জন্যও ৫ সেকেন্ড টাইমার
                const vttController = new AbortController();
                const vttTimeout = setTimeout(() => vttController.abort(), 5000);
                const vttResponse = await fetch(vttUrl, { signal: vttController.signal });
                clearTimeout(vttTimeout);
                
                if (!vttResponse.ok) throw new Error('Failed to download VTT file.');

                const vttText = await vttResponse.text();

                // ৩. VTT ফাইল পার্স করা
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
                        currentEnd = timeToSeconds(timeParts[1].split(/\s+/)[0]);
                        currentText = [];
                    } else if (line === '' && currentText.length > 0) {
                        let text = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
                        text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                        text = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim(); // সাউন্ড ব্র্যাকেট রিমুভ
                        if (text) transcript.push({ start: currentStart, end: currentEnd, en: text });
                        currentText = [];
                    } else if (line !== 'WEBVTT' && line !== '' && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
                        currentText.push(line);
                    }
                }

                // শেষ লাইনটি যুক্ত করা
                if (currentText.length > 0) {
                    let text = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
                    text = text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                    text = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
                    if (text) transcript.push({ start: currentStart, end: currentEnd, en: text });
                }

                if (transcript.length > 0) {
                    console.log(`[✔] Success! Downloaded from ${server}`);
                    return res.json(transcript); // সফল হলে ফ্রন্টএন্ডে পাঠিয়ে লুপ ব্রেক করবে
                } else {
                    throw new Error('Parsed transcript is empty.');
                }

            } catch (err) {
                console.log(`   [✖] Failed: ${err.message}`);
                lastError = err.message;
                // ফেইল করলে লুপ ঘুরে ২য় সার্ভারে চলে যাবে
            }
        }

        // ১০টি সার্ভারই ফেইল করলে
        throw new Error(`All 10 live servers failed or timed out. Last Error: ${lastError}`);

    } catch (error) {
        console.error(`[FATAL ERROR] ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Self-Healing Server running on port ${PORT}`);
});

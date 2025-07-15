const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "http://localhost:8080" } });

const port = process.env.PORT || 3000;
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

const tokenCache = {};
const activeJobs = {}; 

app.use(cors());
app.use(express.json());

const getValidAccessToken = async (profile) => {
    const now = Date.now();
    if (tokenCache[profile.profileName] && tokenCache[profile.profileName].expiresAt > now) {
        return tokenCache[profile.profileName].accessToken;
    }
    try {
        const params = new URLSearchParams({
            refresh_token: profile.refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token'
        });
        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        const { access_token, expires_in } = response.data;
        tokenCache[profile.profileName] = { accessToken: access_token, expiresAt: now + ((expires_in - 60) * 1000) };
        return access_token;
    } catch (error) {
        console.error(`FATAL: Could not refresh token for ${profile.profileName}.`);
        throw new Error('Failed to refresh token.');
    }
};

const makeApiCall = async (method, url, data, profile) => {
    const accessToken = await getValidAccessToken(profile);
    const headers = { 'Authorization': `Zoho-oauthtoken ${accessToken}` };
    return axios({ method, url, data, headers });
};

app.get('/api/profiles', (req, res) => {
    try {
        const profilesData = fs.readFileSync(path.join(__dirname, 'profiles.json'));
        const allProfiles = JSON.parse(profilesData);
        res.json(allProfiles.map(({ refreshToken, ...rest }) => rest));
    } catch (error) {
        res.status(500).json({ message: "Could not load profiles." });
    }
});

io.on('connection', (socket) => {
    console.log(`[DEBUG] New connection. Socket ID: ${socket.id}`);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    socket.on('startBulkCreate', async (data) => {
        const { emails, subject, description, delay, selectedProfileName } = data;
        
        console.log(`[DEBUG] 'startBulkCreate' event received from ${socket.id}`);
        activeJobs[socket.id] = { status: 'running' };

        try {
            const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles.json')));
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) {
                socket.emit('bulkError', { message: 'Profile not found.' });
                delete activeJobs[socket.id];
                return;
            }

            // Set the full job details
            activeJobs[socket.id].details = { emails, subject, description, delay, activeProfile };
            activeJobs[socket.id].currentIndex = 0;
            console.log(`[DEBUG] Job initialized:`, JSON.stringify(activeJobs[socket.id]));


            for (let i = 0; i < emails.length; i++) {
                console.log(`[DEBUG] Loop top. Iteration: ${i}. Job state:`, JSON.stringify(activeJobs[socket.id]));

                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') {
                    console.log(`[DEBUG] Job ended, breaking loop.`);
                    break;
                }
                
                while (activeJobs[socket.id]?.status === 'paused') {
                    console.log(`[DEBUG] Paused... waiting.`);
                    await sleep(500);
                }

                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') {
                    console.log(`[DEBUG] Job ended during pause, breaking loop.`);
                    break;
                }
                
                if (i > 0 && delay > 0) await sleep(delay * 1000);
                
                const email = emails[i];
                if (!email.trim()) continue;

                console.log(`Processing ticket ${i + 1}/${emails.length} for ${email}`);
                const ticketData = { subject, description, departmentId: activeProfile.defaultDepartmentId, contact: { email } };
                
                try {
                    const response = await makeApiCall('post', 'https://desk.zoho.com/api/v1/tickets', ticketData, activeProfile);
                    socket.emit('ticketResult', { email, success: true, ticketNumber: response.data.ticketNumber, fullResponse: response.data });
                } catch (error) {
                    const errorMessage = error.response?.data?.message || 'API Error';
                    socket.emit('ticketResult', { email, success: false, error: errorMessage, fullResponse: error.response?.data });
                }

                // Update currentIndex in the job object
                if(activeJobs[socket.id]) {
                    activeJobs[socket.id].currentIndex = i + 1;
                }
            }

        } catch (error) {
            socket.emit('bulkError', { message: 'A critical server error occurred.' });
        } finally {
            if (activeJobs[socket.id]) {
                const finalStatus = activeJobs[socket.id].status;
                if (finalStatus === 'ended') {
                    socket.emit('bulkEnded');
                } else {
                    socket.emit('bulkComplete');
                }
                console.log(`[DEBUG] Job finished with status: ${finalStatus}. Cleaning up.`);
                delete activeJobs[socket.id];
            }
        }
    });

    socket.on('pauseJob', () => {
        if (activeJobs[socket.id]) {
            activeJobs[socket.id].status = 'paused';
            console.log(`[DEBUG] 'pauseJob' event. New state:`, JSON.stringify(activeJobs[socket.id]));
        }
    });

    socket.on('resumeJob', () => {
        if (activeJobs[socket.id]) {
            activeJobs[socket.id].status = 'running';
            console.log(`[DEBUG] 'resumeJob' event. New state:`, JSON.stringify(activeJobs[socket.id]));
        }
    });

    socket.on('endJob', () => {
        if (activeJobs[socket.id]) {
            activeJobs[socket.id].status = 'ended';
            console.log(`[DEBUG] 'endJob' event. New state:`, JSON.stringify(activeJobs[socket.id]));
        }
    });

    socket.on('disconnect', () => {
        console.log(`[DEBUG] User disconnected: ${socket.id}. Deleting job.`);
        delete activeJobs[socket.id];
    });
});

server.listen(port, () => {
    console.log(`?? Server is running on http://localhost:${port}`);
});
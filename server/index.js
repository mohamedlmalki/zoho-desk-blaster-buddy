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

const tokenCache = {};
const activeJobs = {}; 

app.use(cors());
app.use(express.json());

// --- MODIFIED: This function now returns the full data object on success ---
const getValidAccessToken = async (profile) => {
    const now = Date.now();
    
    // The cache stores the full data object, so we check for its access_token
    if (tokenCache[profile.profileName] && tokenCache[profile.profileName].data.access_token && tokenCache[profile.profileName].expiresAt > now) {
        return tokenCache[profile.profileName].data;
    }

    try {
        const params = new URLSearchParams({
            refresh_token: profile.refreshToken,
            client_id: profile.clientId,
            client_secret: profile.clientSecret,
            grant_type: 'refresh_token'
        });

        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        
        const { expires_in } = response.data;
        // Cache the entire response data
        tokenCache[profile.profileName] = { data: response.data, expiresAt: now + ((expires_in - 60) * 1000) };
        // Return the entire response data
        return response.data;

    } catch (error) {
        const errorMessage = error.response?.data?.error || error.message || 'Failed to refresh token.';
        console.error(`TOKEN_REFRESH_FAILED for ${profile.profileName}:`, errorMessage);
        throw error;
    }
};

// --- MODIFIED: This function now expects an object from getValidAccessToken ---
const makeApiCall = async (method, url, data, profile) => {
    const tokenResponse = await getValidAccessToken(profile);
    const accessToken = tokenResponse.access_token; // Extract the token from the object
    if (!accessToken) {
        throw new Error('Failed to retrieve a valid access token.');
    }
    const headers = { 'Authorization': `Zoho-oauthtoken ${accessToken}` };
    return axios({ method, url, data, headers });
};

app.get('/api/profiles', (req, res) => {
    try {
        const profilesData = fs.readFileSync(path.join(__dirname, 'profiles.json'));
        const allProfiles = JSON.parse(profilesData);
        const safeProfiles = allProfiles.map(({ refreshToken, clientId, clientSecret, ...rest }) => rest);
        res.json(safeProfiles);
    } catch (error) {
        res.status(500).json({ message: "Could not load profiles." });
    }
});

io.on('connection', (socket) => {
    console.log(`[INFO] New connection. Socket ID: ${socket.id}`);

    // --- MODIFIED: checkApiStatus now sends the full response on success ---
    socket.on('checkApiStatus', async (data) => {
        const { selectedProfileName } = data;
        try {
            const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles.json')));
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) {
                throw new Error('Profile not found in profiles.json.');
            }
            
            // Capture the full response object
            const tokenResponse = await getValidAccessToken(activeProfile);
            
            socket.emit('apiStatusResult', { 
                success: true, 
                message: 'Token is valid. Connection to Zoho API is successful.',
                fullResponse: tokenResponse // Send the full response
            });
        } catch (error) {
            const errorMessage = error.response?.data?.error || error.message;
            socket.emit('apiStatusResult', { 
                success: false, 
                message: `Connection failed: ${errorMessage}`,
                fullResponse: error.response?.data || { error: errorMessage }
            });
        }
    });
    
    // ... other socket listeners like startBulkCreate remain the same ...
    const interruptibleSleep = (ms, socketId) => {
        return new Promise(resolve => {
            if (ms <= 0) return resolve();
            const interval = 100;
            let elapsed = 0;
            const timerId = setInterval(() => {
                if (!activeJobs[socketId] || activeJobs[socketId].status === 'ended') {
                    clearInterval(timerId);
                    return resolve();
                }
                elapsed += interval;
                if (elapsed >= ms) {
                    clearInterval(timerId);
                    resolve();
                }
            }, interval);
        });
    };

    socket.on('sendTestTicket', async (data) => {
        const { email, subject, description, selectedProfileName } = data;
        if (!email || !selectedProfileName) {
            return socket.emit('testTicketResult', { success: false, error: 'Missing email or profile.' });
        }
        try {
            const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles.json')));
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) {
                return socket.emit('testTicketResult', { success: false, error: 'Profile not found.' });
            }
            const ticketData = { subject, description, departmentId: activeProfile.defaultDepartmentId, contact: { email } };
            const response = await makeApiCall('post', 'https://desk.zoho.com/api/v1/tickets', ticketData, activeProfile);
            socket.emit('testTicketResult', { success: true, fullResponse: response.data });
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message;
            socket.emit('testTicketResult', { success: false, error: errorMessage, fullResponse: error.response?.data });
        }
    });

    socket.on('startBulkCreate', async (data) => {
        const { emails, subject, description, delay, selectedProfileName } = data;
        
        activeJobs[socket.id] = { status: 'running' };

        try {
            const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles.json')));
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) {
                socket.emit('bulkError', { message: 'Profile not found.' });
                delete activeJobs[socket.id];
                return;
            }

            activeJobs[socket.id].details = { emails, subject, description, delay, activeProfile };
            activeJobs[socket.id].currentIndex = 0;

            for (let i = 0; i < emails.length; i++) {
                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') break;
                
                while (activeJobs[socket.id]?.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') break;
                
                if (i > 0 && delay > 0) {
                    await interruptibleSleep(delay * 1000, socket.id);
                }
                
                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') break;

                const email = emails[i];
                if (!email.trim()) continue;

                const ticketData = { subject, description, departmentId: activeProfile.defaultDepartmentId, contact: { email } };
                
                try {
                    const response = await makeApiCall('post', 'https://desk.zoho.com/api/v1/tickets', ticketData, activeProfile);
                    socket.emit('ticketResult', { email, success: true, ticketNumber: response.data.ticketNumber, fullResponse: response.data });
                } catch (error) {
                    const errorMessage = error.response?.data?.message || 'API Error';
                    socket.emit('ticketResult', { email, success: false, error: errorMessage, fullResponse: error.response?.data });
                }

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
                delete activeJobs[socket.id];
            }
        }
    });

    socket.on('pauseJob', () => {
        if (activeJobs[socket.id]) {
            activeJobs[socket.id].status = 'paused';
        }
    });

    socket.on('resumeJob', () => {
        if (activeJobs[socket.id]) {
            activeJobs[socket.id].status = 'running';
        }
    });

    socket.on('endJob', () => {
        if (activeJobs[socket.id]) {
            activeJobs[socket.id].status = 'ended';
        }
    });

    socket.on('disconnect', () => {
        delete activeJobs[socket.id];
    });
});

server.listen(port, () => {
    console.log(`?? Server is running on http://localhost:${port}`);
});
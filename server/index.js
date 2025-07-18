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

const getValidAccessToken = async (profile) => {
    const now = Date.now();
    
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
        tokenCache[profile.profileName] = { data: response.data, expiresAt: now + ((expires_in - 60) * 1000) };
        return response.data;

    } catch (error) {
        const errorMessage = error.response?.data?.error || error.message || 'Failed to refresh token.';
        console.error(`TOKEN_REFRESH_FAILED for ${profile.profileName}:`, errorMessage);
        throw error;
    }
};

const makeApiCall = async (method, relativeUrl, data, profile) => {
    const tokenResponse = await getValidAccessToken(profile);
    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
        throw new Error('Failed to retrieve a valid access token.');
    }

    const fullUrl = `https://desk.zoho.com${relativeUrl}`;

    const headers = { 
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'orgId': profile.orgId 
    };
    
    return axios({ method, url: fullUrl, data, headers });
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

    socket.on('checkApiStatus', async (data) => {
        try {
            const { selectedProfileName } = data;
            const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles.json')));
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            const tokenResponse = await getValidAccessToken(activeProfile);
            socket.emit('apiStatusResult', { 
                success: true, 
                message: 'Token is valid. Connection to Zoho API is successful.',
                fullResponse: tokenResponse
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
            const response = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile);
            socket.emit('testTicketResult', { success: true, fullResponse: response.data });
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message;
            socket.emit('testTicketResult', { success: false, error: errorMessage, fullResponse: error.response?.data });
        }
    });

    // --- START: MODIFICATION ---
    // This entire function is now updated with the new asynchronous logic
    socket.on('startBulkCreate', async (data) => {
        const { emails, subject, description, delay, selectedProfileName, sendDirectReply, verifyEmail } = data;
        
        activeJobs[socket.id] = { status: 'running' };

        try {
            const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'profiles.json')));
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) {
                throw new Error('Profile not found.');
            }
            if (sendDirectReply && !activeProfile.fromEmailAddress) {
                throw new Error(`Profile "${selectedProfileName}" is missing "fromEmailAddress".`);
            }

            // Phase 1: Create all tickets quickly
            for (let i = 0; i < emails.length; i++) {
                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') break;
                while (activeJobs[socket.id]?.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, socket.id);
                if (!activeJobs[socket.id] || activeJobs[socket.id].status === 'ended') break;

                const email = emails[i];
                if (!email.trim()) continue;

                const ticketData = { subject, description, departmentId: activeProfile.defaultDepartmentId, contact: { email } };

                try {
                    const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile);
                    const newTicket = ticketResponse.data;
                    const successMessage = `Ticket #${newTicket.ticketNumber} created.`;

                    // Immediately emit the creation success
                    socket.emit('ticketResult', { 
                        email, 
                        success: true, 
                        ticketNumber: newTicket.ticketNumber, 
                        details: successMessage,
                        fullResponse: { ticketCreate: newTicket }
                    });

                    // If verification is needed, start it in the background without waiting for it
                    if (verifyEmail) {
                        // "fire and forget" this function
                        verifyTicketEmail(newTicket, activeProfile, socket);
                    }

                } catch (error) {
                    const errorMessage = error.response?.data?.message || 'API Error';
                    socket.emit('ticketResult', { email, success: false, error: errorMessage, fullResponse: error.response?.data });
                }
            }

        } catch (error) {
            socket.emit('bulkError', { message: error.message || 'A critical server error occurred.' });
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
    // --- END: MODIFICATION ---

    // --- START: NEW HELPER FUNCTION ---
    // This new function runs in the background to verify emails
    const verifyTicketEmail = async (ticket, profile, socket) => {
        try {
            // 1. Wait for 10 seconds
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // 2. Make two separate API calls for history
            const workflowHistoryResponse = await makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=WorkflowHistory`, null, profile);
            const notificationHistoryResponse = await makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=NotificationRuleHistory`, null, profile);

            // 3. Combine results
            const allHistoryEvents = [
                ...(workflowHistoryResponse.data.data || []),
                ...(notificationHistoryResponse.data.data || [])
            ];

            const emailSent = allHistoryEvents.length > 0;
            const verificationMessage = `Email verification: ${emailSent ? 'Sent' : 'Not Found'}.`;
            const finalDetails = `Ticket #${ticket.ticketNumber} created. ${verificationMessage}`;

            // 4. Send a new 'ticketUpdate' message to the frontend
            socket.emit('ticketUpdate', {
                ticketNumber: ticket.ticketNumber,
                details: finalDetails,
                fullResponse: {
                    ticketCreate: ticket, // The original ticket data
                    verifyEmail: {
                        workflowHistory: workflowHistoryResponse.data,
                        notificationHistory: notificationHistoryResponse.data
                    }
                }
            });

        } catch (error) {
            console.error(`Failed to verify email for ticket #${ticket.ticketNumber}:`, error.message);
            // Optionally send an update on failure
            socket.emit('ticketUpdate', {
                ticketNumber: ticket.ticketNumber,
                details: `Ticket #${ticket.ticketNumber} created. Email verification: Failed.`,
                fullResponse: { ticketCreate: ticket, verifyEmail: { error: error.message } }
            });
        }
    };
    // --- END: NEW HELPER FUNCTION ---

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
import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { DashboardLayout } from './DashboardLayout';
import { ProfileSelector } from './ProfileSelector';
import { TicketForm } from './TicketForm';
import { ResultsDisplay, TicketResult } from './ResultsDisplay';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Profile {
  profileName: string;
  orgId: string;
  defaultDepartmentId: string;
}

interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
}

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

const SERVER_URL = "http://localhost:3000";

let socket: Socket;

export const ZohoDashboard: React.FC = () => {
  const { toast } = useToast();
  
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [results, setResults] = useState<TicketResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<Date | null>(null);
  const [processingTime, setProcessingTime] = useState('0s');
  const [totalTicketsToProcess, setTotalTicketsToProcess] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [currentDelay, setCurrentDelay] = useState(1);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);


  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) {
        throw new Error('Could not connect to the server.');
      }
      return response.json();
    }
  });

  useEffect(() => {
    if (!selectedProfile && profiles.length > 0) {
        const firstProfile = profiles[0];
        setSelectedProfile(firstProfile);
      }
  }, [profiles]);

  useEffect(() => {
    socket = io(SERVER_URL);

    socket.on('connect', () => {
        console.log('Connected to WebSocket server!');
        if (selectedProfile) {
            setApiStatus({ status: 'loading', message: 'Checking API connection...' });
            socket.emit('checkApiStatus', { selectedProfileName: selectedProfile.profileName });
        }
    });

    socket.on('apiStatusResult', (result: { success: boolean, message: string, fullResponse?: any }) => {
      setApiStatus({
        status: result.success ? 'success' : 'error',
        message: result.message,
        fullResponse: result.fullResponse || null
      });
    });

    socket.on('testTicketResult', (result: any) => {
        setTestResult(result);
        setIsTestModalOpen(true);
    });

    socket.on('ticketResult', (result: TicketResult) => setResults(prev => [...prev, result]));

    socket.on('bulkComplete', () => {
      setIsProcessing(false);
      setIsPaused(false);
      setIsComplete(true);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setCountdown(0);
      toast({ title: "Processing Complete!", description: "All tickets have been processed." });
    });

    socket.on('bulkEnded', () => {
      setIsProcessing(false);
      setIsPaused(false);
      setIsComplete(true);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setCountdown(0);
      toast({ title: "Job Ended", description: "The process was stopped by the user.", variant: "destructive" });
    });

    socket.on('bulkError', (error: { message: string }) => {
      setIsProcessing(false);
      setIsPaused(false);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setCountdown(0);
      toast({ title: "Server Error", description: error.message, variant: "destructive" });
    });
    
    return () => {
      socket.disconnect();
    };
  }, [toast, selectedProfile]);

  useEffect(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    if (isProcessing && !isPaused && results.length > 0 && results.length < totalTicketsToProcess) {
      setCountdown(currentDelay);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [results, isProcessing, totalTicketsToProcess, isPaused, currentDelay]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing && !isPaused && processingStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - processingStartTime.getTime()) / 1000);
        setProcessingTime(`${elapsed}s`);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing, isPaused, processingStartTime]);

  const handleProfileChange = (profileName: string) => {
    const profile = profiles.find(p => p.profileName === profileName);
    if (profile) {
      setSelectedProfile(profile);
      toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
      setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
      if (socket && socket.connected) {
        socket.emit('checkApiStatus', { selectedProfileName: profile.profileName });
      }
    }
  };

  const handleSendTest = (data: { email: string, subject: string, description: string }) => {
    if (!selectedProfile) {
        toast({ title: "No Profile Selected", description: "Please select a profile before sending a test.", variant: "destructive" });
        return;
    }
    toast({ title: "Sending Test Ticket..." });
    socket.emit('sendTestTicket', { ...data, selectedProfileName: selectedProfile.profileName });
  };

  const handleFormSubmit = async (formData: TicketFormData) => {
    const emails = formData.emails.split('\n').map(email => email.trim()).filter(email => email !== '');
    if (emails.length === 0 || !selectedProfile) {
      toast({ title: "Missing Information", description: "Please select a profile and enter at least one email.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    setIsComplete(false);
    setResults([]);
    setProcessingStartTime(new Date());
    setProcessingTime('0s');
    setTotalTicketsToProcess(emails.length);
    setCurrentDelay(formData.delay);
    
    toast({ title: "Processing Started", description: `Creating ${emails.length} tickets...` });

    socket.emit('startBulkCreate', {
      ...formData,
      emails,
      selectedProfileName: selectedProfile.profileName
    });
  };
  
  const handlePauseResume = () => {
    if (isPaused) {
      socket.emit('resumeJob');
      toast({ title: "Job Resumed", description: "The ticket creation will continue." });
    } else {
      socket.emit('pauseJob');
      toast({ title: "Job Paused", description: "The ticket creation is paused." });
    }
    setIsPaused(!isPaused);
  };
  
  const handleEndJob = () => {
    socket.emit('endJob');
    setResults([]);
    setTotalTicketsToProcess(0);
  };

  const stats = {
    totalTickets: results.length,
    successCount: results.filter(r => r.success).length,
    errorCount: results.filter(r => !r.success).length,
    processingTime,
  };

  return (
    <>
      <DashboardLayout stats={stats}>
        <div className="space-y-8">
          <ProfileSelector
            profiles={profiles}
            selectedProfile={selectedProfile}
            onProfileChange={handleProfileChange}
            apiStatus={apiStatus}
            onShowStatus={() => setIsStatusModalOpen(true)}
          />
          <TicketForm
            onSubmit={handleFormSubmit}
            isProcessing={isProcessing}
            isPaused={isPaused}
            onPauseResume={handlePauseResume}
            onEndJob={handleEndJob}
            onSendTest={handleSendTest}
          />
          <ResultsDisplay
            results={results}
            isProcessing={isProcessing}
            isComplete={isComplete}
            totalTickets={totalTicketsToProcess}
            countdown={countdown}
          />
        </div>
      </DashboardLayout>
      
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>API Connection Status</DialogTitle>
                <DialogDescription>
                    This is the live status of the connection to the Zoho Desk API for the selected profile.
                </DialogDescription>
            </DialogHeader>
            <div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}>
                <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
                <p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p>
            </div>

            {apiStatus.fullResponse && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
                <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                    {JSON.stringify(apiStatus.fullResponse, null, 2)}
                </pre>
              </div>
            )}

            <Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-large">
          <DialogHeader>
            <DialogTitle>Test Ticket Response</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
          <Button onClick={() => setIsTestModalOpen(false)}>Close</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
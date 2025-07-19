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
import { Badge } from '@/components/ui/badge'; 
import { AlertCircle, Ticket, User, Building, MailWarning, Loader2, RefreshCw } from 'lucide-react';

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
  sendDirectReply: boolean;
  verifyEmail: boolean;
}

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface EmailFailure {
  ticketNumber: string;
  subject: string;
  reason: string;
  errorMessage: string;
  departmentName: string;
  channel: string;
  assignee: {
      name: string;
  } | null;
}

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
  const [isTestVerifying, setIsTestVerifying] = useState(false);
  
  const [emailFailures, setEmailFailures] = useState<EmailFailure[]>([]);
  const [isFailuresModalOpen, setIsFailuresModalOpen] = useState(false);

  // --- START: NEW FEATURE ---
  // Add state for the filter text
  const [filterText, setFilterText] = useState('');
  // --- END: NEW FEATURE ---


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

    socket.on('testTicketVerificationResult', (result: { success: boolean, details: string, fullResponse: any }) => {
      setIsTestVerifying(false);
      setTestResult(prevResult => ({
        ...prevResult,
        fullResponse: {
          ...prevResult.fullResponse,
          verifyEmail: result.fullResponse.verifyEmail
        }
      }));
      toast({ 
        title: result.success ? "Test Verification Complete" : "Test Verification Failed", 
        description: "The test popup has been updated with the result."
      });
    });

    socket.on('ticketResult', (result: TicketResult) => setResults(prev => [...prev, result]));
    
    socket.on('ticketUpdate', (updateData: { ticketNumber: string, success: boolean, details: string, fullResponse: any }) => {
        setResults(prevResults => 
            prevResults.map(result => 
                result.ticketNumber === updateData.ticketNumber 
                    ? { ...result, success: updateData.success, details: updateData.details, fullResponse: updateData.fullResponse } 
                    : result
            )
        );
    });

    socket.on('emailFailuresResult', (result: { success: boolean, data?: EmailFailure[], error?: string }) => {
        if (result.success) {
            setEmailFailures(result.data || []);
            setIsFailuresModalOpen(true);
        } else {
            toast({
                title: "Error Fetching Failures",
                description: result.error,
                variant: "destructive",
            });
        }
    });

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
  
  const handleManualVerify = () => {
    if (!selectedProfile) {
      toast({ title: "No Profile Selected", description: "Cannot verify status without a profile.", variant: "destructive" });
      return;
    }
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    if (socket && socket.connected) {
      socket.emit('checkApiStatus', { selectedProfileName: selectedProfile.profileName });
    }
    toast({ title: "Re-checking Connection..." });
  };

  const handleSendTest = (data: { email: string, subject: string, description: string, sendDirectReply: boolean, verifyEmail: boolean }) => {
    if (!selectedProfile) {
        toast({ title: "No Profile Selected", description: "Please select a profile before sending a test.", variant: "destructive" });
        return;
    }
    setTestResult(null);
    setIsTestVerifying(data.verifyEmail);
    
    toast({ 
      title: "Sending Test Ticket...",
      description: data.verifyEmail ? "Verification result will appear in the popup in ~10 seconds." : ""
    });
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
    setFilterText('');
    
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
  
  const handleFetchEmailFailures = () => {
    if (!selectedProfile) {
      toast({ title: "No Profile Selected", description: "Please select a profile first.", variant: "destructive" });
      return;
    }
    toast({ title: "Fetching Email Failures..." });
    socket.emit('getEmailFailures', { selectedProfileName: selectedProfile.profileName });
  };

  const stats = {
    totalTickets: results.length,
    successCount: results.filter(r => r.success).length,
    errorCount: results.filter(r => !r.success).length,
    processingTime,
    totalToProcess: totalTicketsToProcess,
    isProcessing: isProcessing,
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
            onFetchFailures={handleFetchEmailFailures}
            onManualVerify={handleManualVerify}
          />
          <TicketForm
            onSubmit={handleFormSubmit}
            isProcessing={isProcessing}
            isPaused={isPaused}
            onPauseResume={handlePauseResume}
            onEndJob={handleEndJob}
            onSendTest={handleSendTest}
          />
          {/* --- START: NEW FEATURE --- */}
          {/* Pass the filter state down to the ResultsDisplay component */}
          <ResultsDisplay
            results={results}
            isProcessing={isProcessing}
            isComplete={isComplete}
            totalTickets={totalTicketsToProcess}
            countdown={countdown}
            filterText={filterText}
            onFilterTextChange={setFilterText}
          />
          {/* --- END: NEW FEATURE --- */}
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
          <div className="max-h-[70vh] overflow-y-auto space-y-4 p-1">
            {testResult?.fullResponse?.ticketCreate ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-foreground">Ticket Creation Response</h4>
                  <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                    {JSON.stringify(testResult.fullResponse.ticketCreate, null, 2)}
                  </pre>
                </div>

                {testResult.fullResponse.sendReply && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-foreground">Send Reply Response</h4>
                    <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                      {JSON.stringify(testResult.fullResponse.sendReply, null, 2)}
                    </pre>
                  </div>
                )}

                {isTestVerifying && (
                  <div className="p-4 rounded-md bg-muted/50 text-center flex items-center justify-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
                    <span className="text-sm text-muted-foreground">Verifying email, please wait...</span>
                  </div>
                )}

                {testResult.fullResponse.verifyEmail && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-foreground">Email Verification Response</h4>
                    <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                      {JSON.stringify(testResult.fullResponse.verifyEmail, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                  {JSON.stringify(testResult, null, 2)}
              </pre>
            )}
          </div>
          <Button onClick={() => setIsTestModalOpen(false)}>Close</Button>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isFailuresModalOpen} onOpenChange={setIsFailuresModalOpen}>
        <DialogContent className="max-w-3xl">
            <DialogHeader>
                <DialogTitle>Email Delivery Failure Alerts</DialogTitle>
                <DialogDescription>
                    Showing recent email delivery failures for the selected department.
                </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
              {emailFailures.length > 0 ? (
                <div className="space-y-4">
                  {emailFailures.map((failure, index) => (
                    <div key={index} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Ticket className="h-4 w-4 text-primary"/>
                            <span className="font-semibold text-foreground">Ticket #{failure.ticketNumber}</span>
                          </div>
                          <Badge variant="destructive">Failed</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground italic mb-3">"{failure.subject}"</p>
                      
                      <div className="text-xs space-y-2 mb-3">
                          <div className="flex items-center">
                              <Building className="h-3 w-3 mr-2 text-muted-foreground"/>
                              <span className="text-muted-foreground mr-1">Department:</span>
                              <span className="font-medium text-foreground">{failure.departmentName}</span>
                          </div>
                          <div className="flex items-center">
                            <User className="h-3 w-3 mr-2 text-muted-foreground"/>
                            <span className="text-muted-foreground mr-1">Assignee:</span>
                            <span className="font-medium text-foreground">{failure.assignee?.name || 'Unassigned'}</span>
                          </div>
                      </div>

                      <div className="p-3 rounded-md bg-muted/50 text-xs space-y-1">
                          <p><strong className="text-foreground">Reason:</strong> {failure.reason}</p>
                          <p><strong className="text-foreground">Error:</strong> {failure.errorMessage}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="font-semibold">No Failures Found</p>
                  <p className="text-sm text-muted-foreground mt-1">There are no recorded email delivery failures for this department.</p>
                </div>
              )}
            </div>
            <Button onClick={() => setIsFailuresModalOpen(false)} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
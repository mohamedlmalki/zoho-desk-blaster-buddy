import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { AlertCircle, Ticket, User, Building, MailWarning, Loader2, RefreshCw, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// --- Interface Definitions ---
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

interface DashboardSession {
    id: string;
    jobId: string | null;
    profile: Profile | null;
    apiStatus: ApiStatus;
    results: TicketResult[];
    isProcessing: boolean;
    isPaused: boolean;
    isComplete: boolean;
    processingStartTime: Date | null;
    processingTime: string;
    totalTicketsToProcess: number;
    countdown: number;
    currentDelay: number;
    filterText: string;
}


const SERVER_URL = "http://localhost:3000";

const createNewSession = (id: string, profile: Profile | null): DashboardSession => ({
    id,
    jobId: null,
    profile,
    apiStatus: { status: 'loading', message: 'Initializing...' },
    results: [],
    isProcessing: false,
    isPaused: false,
    isComplete: false,
    processingStartTime: null,
    processingTime: '0s',
    totalTicketsToProcess: 0,
    countdown: 0,
    currentDelay: 1,
    filterText: '',
});

export const ZohoDashboard: React.FC = () => {
  const { toast } = useToast();

  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTestVerifying, setIsTestVerifying] = useState(false);
  const [emailFailures, setEmailFailures] = useState<EmailFailure[]>([]);
  const [isFailuresModalOpen, setIsFailuresModalOpen] = useState(false);
  
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) throw new Error('Could not connect to the server.');
      return response.json();
    },
    // This ensures the query only runs once and doesn't refetch automatically
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // --- START: MODIFICATION ---
  // This is the corrected way to initialize the first session.
  // It runs only when profiles are loaded and no sessions exist yet.
  useEffect(() => {
    if (profiles.length > 0 && sessions.length === 0) {
      const initialSession = createNewSession('tab-1', profiles[0]);
      setSessions([initialSession]);
      setActiveTabId('tab-1');
    }
  }, [profiles]);
  // --- END: MODIFICATION ---

  const updateSession = useCallback((sessionId: string, newSessionData: Partial<DashboardSession>) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...newSessionData } : s));
  }, []);
  
  useEffect(() => {
    if (!socketRef.current) {
        socketRef.current = io(SERVER_URL);
    }
    const socket = socketRef.current;

    const handleApiStatusResult = (result: { success: boolean, message: string, fullResponse?: any, jobId: string }) => {
        updateSession(result.jobId, {
            apiStatus: {
                status: result.success ? 'success' : 'error',
                message: result.message,
                fullResponse: result.fullResponse || null
            }
        });
    };

    const handleTicketResult = (result: TicketResult & { jobId: string }) => {
        const { jobId, ...ticketResult } = result;
        setSessions(prev => prev.map(s => 
            s.jobId === jobId ? { ...s, results: [...s.results, ticketResult] } : s
        ));
    };

    const handleTicketUpdate = (updateData: { ticketNumber: string, success: boolean, details: string, fullResponse: any, jobId: string }) => {
        const { jobId, ...update } = updateData;
        setSessions(prev => prev.map(s => 
            s.jobId === jobId ? { ...s, results: s.results.map(r => r.ticketNumber === update.ticketNumber ? { ...r, ...update } : r) } : s
        ));
    };

    const handleBulkComplete = ({ jobId }: { jobId: string }) => {
        const targetSession = sessions.find(s => s.jobId === jobId);
        if (targetSession) {
            updateSession(targetSession.id, { isProcessing: false, isPaused: false, isComplete: true });
            toast({ title: "Processing Complete!", description: `Job for ${targetSession.profile?.profileName} has finished.` });
        }
    };
    
    const handleBulkEnded = ({ jobId }: { jobId: string }) => {
        const targetSession = sessions.find(s => s.jobId === jobId);
        if (targetSession) {
          updateSession(targetSession.id, { isProcessing: false, isPaused: false, isComplete: true, results: [], totalTicketsToProcess: 0 });
          toast({ title: "Job Ended", description: `Job for ${targetSession.profile?.profileName} was stopped.`, variant: "destructive" });
        }
    };
    
    const handleBulkError = ({ message, jobId }: { message: string, jobId: string }) => {
        const targetSession = sessions.find(s => s.jobId === jobId);
        if (targetSession) {
            updateSession(targetSession.id, { isProcessing: false, isPaused: false });
            toast({ title: "Server Error", description: message, variant: "destructive" });
        }
    };

    const handleTestResult = (result: any) => {
        setTestResult(result);
        setIsTestModalOpen(true);
    };

    const handleTestVerificationResult = (result: { success: boolean, details: string, fullResponse: any }) => {
        setIsTestVerifying(false);
        setTestResult(prev => ({ ...prev, fullResponse: { ...prev.fullResponse, verifyEmail: result.fullResponse.verifyEmail } }));
        toast({ title: result.success ? "Test Verification Complete" : "Test Verification Failed", description: "The test popup has been updated." });
    };

    const handleEmailFailuresResult = (result: { success: boolean, data?: EmailFailure[], error?: string }) => {
        if (result.success) {
            setEmailFailures(result.data || []);
            setIsFailuresModalOpen(true);
        } else {
            toast({ title: "Error Fetching Failures", description: result.error, variant: "destructive" });
        }
    };

    socket.on('apiStatusResult', handleApiStatusResult);
    socket.on('ticketResult', handleTicketResult);
    socket.on('ticketUpdate', handleTicketUpdate);
    socket.on('bulkComplete', handleBulkComplete);
    socket.on('bulkEnded', handleBulkEnded);
    socket.on('bulkError', handleBulkError);
    socket.on('testTicketResult', handleTestResult);
    socket.on('testTicketVerificationResult', handleTestVerificationResult);
    socket.on('emailFailuresResult', handleEmailFailuresResult);

    return () => {
        socket.off('apiStatusResult', handleApiStatusResult);
        socket.off('ticketResult', handleTicketResult);
        socket.off('ticketUpdate', handleTicketUpdate);
        socket.off('bulkComplete', handleBulkComplete);
        socket.off('bulkEnded', handleBulkEnded);
        socket.off('bulkError', handleBulkError);
        socket.off('testTicketResult', handleTestResult);
        socket.off('testTicketVerificationResult', handleTestVerificationResult);
        socket.off('emailFailuresResult', handleEmailFailuresResult);
    };
  }, [sessions, toast, updateSession]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    sessions.forEach(session => {
        if (session.profile && session.apiStatus.message === 'Initializing...') {
            updateSession(session.id, { apiStatus: { status: 'loading', message: 'Checking API connection...' }});
            socket.emit('checkApiStatus', { selectedProfileName: session.profile.profileName, jobId: session.id });
        }
    })
  }, [sessions, updateSession]);


  const activeSession = sessions.find(s => s.id === activeTabId);

  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    const sessionWithCountdown = sessions.find(s => s.isProcessing && !s.isPaused && s.results.length > 0 && s.results.length < s.totalTicketsToProcess);

    if (sessionWithCountdown) {
        updateSession(sessionWithCountdown.id, { countdown: sessionWithCountdown.currentDelay });
        countdownIntervalRef.current = setInterval(() => {
            setSessions(prev => prev.map(s => {
                if (s.id === sessionWithCountdown.id && s.countdown > 1) {
                    return { ...s, countdown: s.countdown - 1 };
                }
                if (s.id === sessionWithCountdown.id && s.countdown <= 1) {
                    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                    return { ...s, countdown: 0 };
                }
                return s;
            }));
        }, 1000);
    }
    
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [sessions, setSessions, updateSession]);

  useEffect(() => {
    const processingSessions = sessions.filter(s => s.isProcessing && !s.isPaused);
    if (processingSessions.length === 0) return;

    const interval = setInterval(() => {
        setSessions(prev => prev.map(s => {
            if (s.isProcessing && !s.isPaused && s.processingStartTime) {
                const elapsed = Math.floor((Date.now() - s.processingStartTime.getTime()) / 1000);
                return { ...s, processingTime: `${elapsed}s` };
            }
            return s;
        }));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessions]);
  
  const handleAddTab = useCallback((profileName: string) => {
    const profile = profiles.find(p => p.profileName === profileName);
    if (!profile) return;

    const existingSession = sessions.find(s => s.profile?.profileName === profileName);
    if (existingSession) {
        setActiveTabId(existingSession.id);
        toast({ title: "Tab Already Open", description: `Switched to the existing tab for ${profileName}.`});
        return;
    }

    const newTabId = `tab-${Date.now()}`;
    const newSession = createNewSession(newTabId, profile);
    setSessions(prev => [...prev, newSession]);
    setActiveTabId(newTabId);
  }, [profiles, sessions, toast]);

  const handleCloseTab = (tabIdToClose: string) => {
    const sessionToClose = sessions.find(s => s.id === tabIdToClose);
    if (sessionToClose?.isProcessing && sessionToClose.jobId && socketRef.current) {
        socketRef.current.emit('endJob', { jobId: sessionToClose.jobId });
    }
    
    const remainingSessions = sessions.filter(s => s.id !== tabIdToClose);
    setSessions(remainingSessions);

    if (activeTabId === tabIdToClose) {
        setActiveTabId(remainingSessions.length > 0 ? remainingSessions[0].id : null);
    }
  };
  
  const handleProfileChange = (profileName: string) => {
    if (!activeSession) return;
    const profile = profiles.find(p => p.profileName === profileName);
    if (profile) {
      updateSession(activeSession.id, { profile, apiStatus: { status: 'loading', message: 'Initializing...' }});
      toast({ title: "Profile Changed", description: `Switched to ${profileName} in this tab.` });
    }
  };
  
  const handleManualVerify = () => {
    if (!activeSession || !activeSession.profile || !socketRef.current) return;
    updateSession(activeSession.id, { apiStatus: { status: 'loading', message: 'Re-checking API connection...' }});
    socketRef.current.emit('checkApiStatus', { selectedProfileName: activeSession.profile.profileName, jobId: activeSession.id });
    toast({ title: "Re-checking Connection..." });
  };

  const handleSendTest = (data: { email: string, subject: string, description: string, sendDirectReply: boolean, verifyEmail: boolean }) => {
    if (!activeSession || !activeSession.profile || !socketRef.current) return;
    setTestResult(null);
    setIsTestVerifying(data.verifyEmail);
    toast({ title: "Sending Test Ticket...", description: data.verifyEmail ? "Verification will update the popup." : "" });
    socketRef.current.emit('sendTestTicket', { ...data, selectedProfileName: activeSession.profile.profileName });
  };
  
  const handleFormSubmit = async (formData: TicketFormData) => {
    if (!activeSession || !activeSession.profile || !socketRef.current) return;

    const emails = formData.emails.split('\n').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return;

    const newJobId = `${activeSession.id}-job-${Date.now()}`;
    updateSession(activeSession.id, {
        jobId: newJobId,
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        results: [],
        processingStartTime: new Date(),
        processingTime: '0s',
        totalTicketsToProcess: emails.length,
        currentDelay: formData.delay,
        filterText: '',
    });
    
    toast({ title: "Processing Started", description: `Creating ${emails.length} tickets for ${activeSession.profile.profileName}...` });

    socketRef.current.emit('startBulkCreate', {
      ...formData,
      emails,
      selectedProfileName: activeSession.profile.profileName,
      jobId: newJobId,
    });
  };
  
  const handlePauseResume = () => {
    if (!activeSession || !activeSession.jobId || !socketRef.current) return;
    if (activeSession.isPaused) {
      socketRef.current.emit('resumeJob', { jobId: activeSession.jobId });
      toast({ title: "Job Resumed" });
    } else {
      socketRef.current.emit('pauseJob', { jobId: activeSession.jobId });
      toast({ title: "Job Paused" });
    }
    updateSession(activeSession.id, { isPaused: !activeSession.isPaused });
  };
  
  const handleEndJob = () => {
    if (!activeSession || !activeSession.jobId || !socketRef.current) return;
    socketRef.current.emit('endJob', { jobId: activeSession.jobId });
  };
  
  const handleFetchEmailFailures = () => {
    if (!activeSession || !activeSession.profile || !socketRef.current) return;
    toast({ title: "Fetching Email Failures..." });
    socketRef.current.emit('getEmailFailures', { selectedProfileName: activeSession.profile.profileName });
  };

  const overallStats = sessions.reduce((acc, session) => ({
    totalTickets: acc.totalTickets + session.results.length,
    successCount: acc.successCount + session.results.filter(r => r.success).length,
    errorCount: acc.errorCount + session.results.filter(r => !r.success).length,
    totalToProcess: acc.totalToProcess + (session.isProcessing ? session.totalTicketsToProcess : session.results.length),
    isProcessing: acc.isProcessing || session.isProcessing,
  }), { totalTickets: 0, successCount: 0, errorCount: 0, totalToProcess: 0, isProcessing: false });

  if (profilesLoading || !activeSession) {
      return <DashboardLayout stats={{...overallStats, processingTime: '0s'}}><div className="text-center p-10"><Loader2 className="h-8 w-8 animate-spin mx-auto"/></div></DashboardLayout>
  }

  return (
    <>
      <DashboardLayout stats={{ ...overallStats, processingTime: activeSession.processingTime }}>
          <Tabs value={activeTabId || ''} onValueChange={setActiveTabId} className="w-full">
              <TabsList className="mb-4">
                  {sessions.map(session => (
                      <TabsTrigger key={session.id} value={session.id} className="relative pr-8">
                          {session.profile?.profileName || 'New Tab'}
                          {sessions.length > 1 && (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="absolute right-0.5 top-0.5 h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); handleCloseTab(session.id); }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                          )}
                      </TabsTrigger>
                  ))}
              </TabsList>
              {sessions.map(session => (
                  <TabsContent key={session.id} value={session.id} className="focus-visible:ring-0 focus-visible:ring-offset-0">
                    <div className="space-y-8">
                      <ProfileSelector
                          profiles={profiles}
                          selectedProfile={session.profile}
                          onProfileChange={handleProfileChange}
                          apiStatus={session.apiStatus}
                          onShowStatus={() => setIsStatusModalOpen(true)}
                          onFetchFailures={handleFetchEmailFailures}
                          onManualVerify={handleManualVerify}
                          onAddTab={handleAddTab}
                      />
                      <TicketForm
                          onSubmit={handleFormSubmit}
                          isProcessing={session.isProcessing}
                          isPaused={session.isPaused}
                          onPauseResume={handlePauseResume}
                          onEndJob={handleEndJob}
                          onSendTest={handleSendTest}
                      />
                      <ResultsDisplay
                          results={session.results}
                          isProcessing={session.isProcessing}
                          isComplete={session.isComplete}
                          totalTickets={session.totalTicketsToProcess}
                          countdown={session.countdown}
                          filterText={session.filterText}
                          onFilterTextChange={(text) => updateSession(session.id, { filterText: text })}
                      />
                    </div>
                  </TabsContent>
              ))}
          </Tabs>
      </DashboardLayout>
      
      {/* --- Modals --- */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>API Connection Status</DialogTitle>
                <DialogDescription>
                    Live status of the Zoho Desk API connection for the profile in the active tab.
                </DialogDescription>
            </DialogHeader>
            <div className={`p-4 rounded-md ${activeSession?.apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : activeSession?.apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}>
                <p className="font-bold text-lg">{activeSession?.apiStatus.status.charAt(0).toUpperCase() + (activeSession?.apiStatus.status.slice(1) || '')}</p>
                <p className="text-sm text-muted-foreground mt-1">{activeSession?.apiStatus.message}</p>
            </div>

            {activeSession?.apiStatus.fullResponse && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
                <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                    {JSON.stringify(activeSession.apiStatus.fullResponse, null, 2)}
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
                    Recent email delivery failures for the selected department.
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
                  <p className="text-sm text-muted-foreground mt-1">No recorded email delivery failures for this department.</p>
                </div>
              )}
            </div>
            <Button onClick={() => setIsFailuresModalOpen(false)} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
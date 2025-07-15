import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { DashboardLayout } from './DashboardLayout';
import { ProfileSelector } from './ProfileSelector';
import { TicketForm } from './TicketForm';
import { ResultsDisplay, TicketResult } from './ResultsDisplay';
import { useToast } from '@/hooks/use-toast';

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

const SERVER_URL = "http://localhost:3000";

let socket: Socket;

export const ZohoDashboard: React.FC = () => {
  const { toast } = useToast();
  
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [results, setResults] = useState<TicketResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<Date | null>(null);
  const [processingTime, setProcessingTime] = useState('0s');
  const [totalTicketsToProcess, setTotalTicketsToProcess] = useState(0);
  // --- NEW STATE FOR COUNTDOWN ---
  const [countdown, setCountdown] = useState(0);
  const [currentDelay, setCurrentDelay] = useState(1);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);


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
      setSelectedProfile(profiles[0]);
    }
  }, [profiles, selectedProfile]);

  useEffect(() => {
    socket = io(SERVER_URL);
    socket.on('connect', () => console.log('Connected to WebSocket server!'));
    socket.on('ticketResult', (result: TicketResult) => setResults(prev => [...prev, result]));
    socket.on('bulkComplete', () => {
      setIsProcessing(false);
      setIsComplete(true);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setCountdown(0);
      toast({ title: "Processing Complete!", description: "All tickets have been processed." });
    });
    socket.on('bulkError', (error: { message: string }) => {
      setIsProcessing(false);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setCountdown(0);
      toast({ title: "Server Error", description: error.message, variant: "destructive" });
    });
    return () => {
      socket.disconnect();
    };
  }, [toast]);

  // --- NEW EFFECT FOR COUNTDOWN ---
  useEffect(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    if (isProcessing && results.length > 0 && results.length < totalTicketsToProcess) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, isProcessing, totalTicketsToProcess]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing && processingStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - processingStartTime.getTime()) / 1000);
        setProcessingTime(`${elapsed}s`);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing, processingStartTime]);

  const handleProfileChange = (profileName: string) => {
    const profile = profiles.find(p => p.profileName === profileName);
    if (profile) {
      setSelectedProfile(profile);
      toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
    }
  };

  const handleFormSubmit = async (formData: TicketFormData) => {
    const emails = formData.emails.split('\n').map(email => email.trim()).filter(email => email !== '');
    if (emails.length === 0 || !selectedProfile) {
      toast({ title: "Missing Information", description: "Please select a profile and enter at least one email.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setIsComplete(false);
    setResults([]);
    setProcessingStartTime(new Date());
    setProcessingTime('0s');
    setTotalTicketsToProcess(emails.length);
    // --- STORE DELAY FOR COUNTDOWN ---
    setCurrentDelay(formData.delay);
    
    toast({ title: "Processing Started", description: `Creating ${emails.length} tickets...` });

    socket.emit('startBulkCreate', {
      ...formData,
      emails,
      selectedProfileName: selectedProfile.profileName
    });
  };

  const stats = {
    totalTickets: results.length,
    successCount: results.filter(r => r.success).length,
    errorCount: results.filter(r => !r.success).length,
    processingTime,
  };

  return (
    <DashboardLayout stats={stats}>
      <div className="space-y-8">
        <ProfileSelector
          profiles={profiles}
          selectedProfile={selectedProfile}
          onProfileChange={handleProfileChange}
        />
        <TicketForm
          onSubmit={handleFormSubmit}
          isProcessing={isProcessing}
        />
        <ResultsDisplay
          results={results}
          isProcessing={isProcessing}
          isComplete={isComplete}
          totalTickets={totalTicketsToProcess}
          // --- PASS COUNTDOWN TO CHILD ---
          countdown={countdown}
        />
      </div>
    </DashboardLayout>
  );
};
import React from 'react';
import { Card } from '@/components/ui/card';
import { Ticket, Users, Clock, CheckCircle2 } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  stats?: {
    totalTickets: number;
    successCount: number;
    errorCount: number;
    processingTime: string;
  };
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ 
  children, 
  stats = { totalTickets: 0, successCount: 0, errorCount: 0, processingTime: '0s' }
}) => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-soft">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-primary rounded-lg shadow-glow">
                <Ticket className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Zoho Desk</h1>
                <p className="text-muted-foreground">Bulk Ticket Creator</p>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{stats.totalTickets} Tickets</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success-foreground">{stats.successCount} Success</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{stats.processingTime}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};
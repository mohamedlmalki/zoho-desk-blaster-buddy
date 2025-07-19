import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// This defines the structure of a single failure alert object
interface FailureAlert {
  ticketNumber: string;
  subject: string;
  reason: string;
  assignee: {
    name: string;
  };
}

// This defines the props that our new component will accept
interface FailureLogViewerProps {
  alerts: FailureAlert[];
  onRefresh: () => void;
  isLoading: boolean;
}

export const FailureLogViewer: React.FC<FailureLogViewerProps> = ({ alerts, onRefresh, isLoading }) => {
  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Recent Email Delivery Failures</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <CardDescription>
          This log shows recent email delivery failures across the entire department.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p>No recent email failures found.</p>
            <p>Click "Refresh" to check again.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Reason for Failure</TableHead>
                  <TableHead>Assignee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert, index) => (
                  <TableRow key={index} className="bg-destructive/5 hover:bg-destructive/10">
                    <TableCell className="font-mono">{alert.ticketNumber}</TableCell>
                    <TableCell>{alert.subject}</TableCell>
                    <TableCell className="text-destructive font-medium">{alert.reason}</TableCell>
                    <TableCell>{alert.assignee?.name || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
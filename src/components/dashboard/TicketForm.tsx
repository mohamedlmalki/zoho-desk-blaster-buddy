import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Send, Eye, Mail, Clock, MessageSquare, Users, Pause, Play, Square } from 'lucide-react';

interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
}

interface TicketFormProps {
  onSubmit: (data: TicketFormData) => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  onSendTest: (data: { email: string, subject: string, description: string }) => void;
}

export const TicketForm: React.FC<TicketFormProps> = ({ 
  onSubmit, 
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  onSendTest,
}) => {
  const [formData, setFormData] = useState<TicketFormData>({
    emails: '',
    subject: '',
    description: '',
    delay: 1,
  });
  const [testEmail, setTestEmail] = useState('');

  const emailCount = formData.emails
    .split('\n')
    .filter(email => email.trim() !== '').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleInputChange = (field: keyof TicketFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTestClick = () => {
    onSendTest({
        email: testEmail,
        subject: formData.subject,
        description: formData.description,
    });
  };

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center space-x-2">
          <Send className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Create Bulk Tickets</CardTitle>
        </div>
        <CardDescription>
          Create multiple tickets simultaneously for different recipients
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emails" className="flex items-center space-x-2">
                    <Mail className="h-4 w-4" />
                    <span>Recipient Emails</span>
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {emailCount} recipients
                  </Badge>
                </div>
                <Textarea
                  id="emails"
                  placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                  value={formData.emails}
                  onChange={(e) => handleInputChange('emails', e.target.value)}
                  className="min-h-[200px] font-mono text-sm bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  Enter one email address per line
                </p>
                <div className="pt-4 border-t border-dashed">
                    <Label htmlFor="test-email" className="text-xs text-muted-foreground">Send a single test ticket</Label>
                    <div className="flex items-center space-x-2 mt-2">
                        <Input
                            id="test-email"
                            type="email"
                            placeholder="Enter test email..."
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            className="h-10 bg-muted/30 border-border focus:bg-card"
                            disabled={isProcessing}
                        />
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={handleTestClick}
                            disabled={isProcessing || !testEmail || !formData.subject || !formData.description}
                        >
                            Test
                        </Button>
                    </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject" className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Ticket Subject</span>
                </Label>
                <Input
                  id="subject"
                  placeholder="Enter ticket subject..."
                  value={formData.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  className="h-12 bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay" className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay Between Tickets</span>
                </Label>
                <div className="flex items-center space-x-3">
                  <Input
                    id="delay"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.delay}
                    onChange={(e) => handleInputChange('delay', parseInt(e.target.value) || 0)}
                    className="w-24 h-12 bg-muted/30 border-border focus:bg-card transition-colors"
                    required
                    disabled={isProcessing}
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description" className="flex items-center space-x-2">
                    <MessageSquare className="h-4 w-4" />
                    <span>Ticket Description</span>
                  </Label>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl bg-card border-border shadow-large">
                      <DialogHeader>
                        <DialogTitle>Description Preview</DialogTitle>
                      </DialogHeader>
                      <div 
                        className="p-4 bg-muted/30 rounded-lg border border-border max-h-96 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: formData.description }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
                <Textarea
                  id="description"
                  placeholder="Enter ticket description (HTML supported)..."
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="min-h-[120px] bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  HTML formatting is supported
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            {!isProcessing ? (
              <Button
                type="submit"
                variant="premium"
                size="lg"
                disabled={!formData.emails.trim() || !formData.subject.trim() || !formData.description.trim()}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                Create {emailCount} Tickets
              </Button>
            ) : (
              <div className="flex items-center justify-center space-x-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={onPauseResume}
                  className="flex-1"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume Job
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Job
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={onEndJob}
                  className="flex-1"
                >
                  <Square className="h-4 w-4 mr-2" />
                  End Job
                </Button>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
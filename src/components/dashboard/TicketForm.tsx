import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// --- START: MODIFICATION 1 ---
// Import the new icons for our options and the Checkbox component
import { Send, Eye, Mail, Clock, MessageSquare, Users, Pause, Play, Square, Bot, MailCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
// --- END: MODIFICATION 1 ---


// --- START: MODIFICATION 2 ---
// Update the form data interface to include our new boolean options
interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
}

interface TicketFormProps {
  onSubmit: (data: TicketFormData) => void; // Update this to pass the full form data
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  onSendTest: (data: { email: string, subject: string, description: string }) => void;
}
// --- END: MODIFICATION 2 ---

export const TicketForm: React.FC<TicketFormProps> = ({ 
  onSubmit, 
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  onSendTest,
}) => {
  // --- START: MODIFICATION 3 ---
  // Add our new options to the component's state
  const [formData, setFormData] = useState<TicketFormData>({
    emails: '',
    subject: '',
    description: '',
    delay: 1,
    sendDirectReply: false, // Default to false
    verifyEmail: false,     // Default to false
  });
  // --- END: MODIFICATION 3 ---

  const [testEmail, setTestEmail] = useState('');

  const emailCount = formData.emails
    .split('\n')
    .filter(email => email.trim() !== '').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The full formData, including our new options, is now sent
    onSubmit(formData);
  };

  const handleInputChange = (field: keyof Omit<TicketFormData, 'sendDirectReply' | 'verifyEmail'>, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // --- START: MODIFICATION 4 ---
  // Add a new handler specifically for our checkboxes
  const handleCheckboxChange = (field: 'sendDirectReply' | 'verifyEmail', checked: boolean) => {
    setFormData(prev => ({...prev, [field]: checked}));
  }
  // --- END: MODIFICATION 4 ---

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

              {/* --- START: MODIFICATION 5 --- */}
              {/* This is the new section for our optional features */}
              <div className="space-y-2 pt-2">
                  <Label className="flex items-center space-x-2">
                    <Bot className="h-4 w-4" />
                    <span>Optional Email Actions</span>
                  </Label>
                  <div className="space-y-3 rounded-lg bg-muted/30 p-4 border border-border">
                    <div className="flex items-start space-x-3">
                        <Checkbox
                            id="sendDirectReply"
                            checked={formData.sendDirectReply}
                            onCheckedChange={(checked) => handleCheckboxChange('sendDirectReply', !!checked)}
                            disabled={isProcessing || formData.verifyEmail}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="sendDirectReply" className="font-medium hover:cursor-pointer">Send Direct Public Reply</Label>
                            <p className="text-xs text-muted-foreground">Sends the description as an email reply. Disables Zoho's internal automations for this ticket.</p>
                        </div>
                    </div>
                     <div className="flex items-start space-x-3">
                        <Checkbox
                            id="verifyEmail"
                            checked={formData.verifyEmail}
                            onCheckedChange={(checked) => handleCheckboxChange('verifyEmail', !!checked)}
                            disabled={isProcessing || formData.sendDirectReply}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="verifyEmail" className="font-medium hover:cursor-pointer">Verify Automation Email</Label>
                            <p className="text-xs text-muted-foreground">Slower. Waits and checks if Zoho's automation email was sent.</p>
                        </div>
                    </div>
                  </div>
              </div>
              {/* --- END: MODIFICATION 5 --- */}

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
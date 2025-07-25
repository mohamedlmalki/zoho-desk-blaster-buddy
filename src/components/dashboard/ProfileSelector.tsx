import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
// --- START: MODIFICATION ---
// Import the RefreshCw icon for our new button
import { User, Building, AlertCircle, CheckCircle, Loader, MailWarning, RefreshCw } from 'lucide-react';
// --- END: MODIFICATION ---

interface Profile {
  profileName: string;
  orgId: string;
  defaultDepartmentId: string;
}

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: {
      agentInfo?: {
        firstName?: string;
        lastName?: string;
        orgName?: string;
      }
    }
};

interface ProfileSelectorProps {
  profiles: Profile[];
  selectedProfile: Profile | null;
  onProfileChange: (profileName: string) => void;
  apiStatus: ApiStatus;
  onShowStatus: () => void;
  onFetchFailures: () => void;
  // --- START: MODIFICATION ---
  // Add a new prop for the manual verify handler
  onManualVerify: () => void;
  // --- END: MODIFICATION ---
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfile,
  onProfileChange,
  apiStatus,
  onShowStatus,
  onFetchFailures,
  onManualVerify, // Get the new handler from props
}) => {
  const getBadgeProps = () => {
    switch (apiStatus.status) {
      case 'success':
        return { text: 'Connected', variant: 'success' as const, icon: <CheckCircle className="h-4 w-4 mr-2" /> };
      case 'error':
        return { text: 'Connection Failed', variant: 'destructive' as const, icon: <AlertCircle className="h-4 w-4 mr-2" /> };
      default:
        return { text: 'Checking...', variant: 'secondary' as const, icon: <Loader className="h-4 w-4 mr-2 animate-spin" /> };
    }
  };
  
  const badgeProps = getBadgeProps();

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Profile Selection</CardTitle>
        </div>
        <CardDescription>
          Choose the Zoho Desk profile for ticket creation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Select 
            value={selectedProfile?.profileName || ''} 
            onValueChange={onProfileChange}
            disabled={profiles.length === 0}
          >
            <SelectTrigger className="h-12 bg-muted/50 border-border hover:bg-muted transition-colors">
              <SelectValue placeholder="Select a profile..." />
            </SelectTrigger>
            <SelectContent className="bg-card border-border shadow-large">
              {profiles.map((profile) => (
                <SelectItem 
                  key={profile.profileName} 
                  value={profile.profileName}
                  className="cursor-pointer hover:bg-accent focus:bg-accent"
                >
                  <div className="flex items-center space-x-3">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{profile.profileName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProfile && (
            <div className="p-4 bg-gradient-muted rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Active Profile</span>
                
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={onFetchFailures}>
                      <MailWarning className="h-4 w-4 mr-2"/>
                      View Email Failures
                  </Button>
                  {/* This button is now guaranteed to be clickable to show the status */}
                  <Button variant={badgeProps.variant} size="sm" onClick={onShowStatus}>
                      {badgeProps.icon}
                      {badgeProps.text}
                  </Button>
                  {/* --- START: MODIFICATION --- */}
                  {/* Add the new manual verify button */}
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={onManualVerify}
                    disabled={apiStatus.status === 'loading'}
                  >
                      <RefreshCw className="h-4 w-4"/>
                  </Button>
                  {/* --- END: MODIFICATION --- */}
                </div>
                
              </div>
               <div className="space-y-1 text-sm">
                  {apiStatus.status === 'success' && apiStatus.fullResponse?.agentInfo && (
                      <>
                          <div className="flex justify-between">
                              <span className="text-muted-foreground">Agent Name:</span>
                              <span className="font-medium text-foreground">{apiStatus.fullResponse.agentInfo.firstName} {apiStatus.fullResponse.agentInfo.lastName}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-muted-foreground">Organization:</span>
                              <span className="font-medium text-foreground">{apiStatus.fullResponse.agentInfo.orgName}</span>
                          </div>
                      </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Organization ID:</span>
                    <span className="font-mono text-foreground">{selectedProfile.orgId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Department ID:</span>
                    <span className="font-mono text-foreground">{selectedProfile.defaultDepartmentId}</span>
                  </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
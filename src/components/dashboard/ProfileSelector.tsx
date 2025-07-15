import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { User, Building } from 'lucide-react';

interface Profile {
  profileName: string;
  orgId: string;
  refreshToken: string;
  defaultDepartmentId: string;
}

interface ProfileSelectorProps {
  profiles: Profile[];
  selectedProfile: Profile | null;
  onProfileChange: (profileName: string) => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfile,
  onProfileChange,
}) => {
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
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  Connected
                </Badge>
              </div>
              <div className="space-y-1 text-sm">
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
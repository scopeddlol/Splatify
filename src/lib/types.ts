export type User = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};
export type Event = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  date: string;
  time: string;
  timezone: string;
  venue: string;
  address: string;
  capacity: number;
  currency: string;
  inviteToken: string;
  createdAt: string;
  theme: string;
};
export type Guest = {
  id: string;
  name: string;
  status: "going" | "maybe" | "declined";
  marker: "mechanical" | "electric" | "rental";
  team: string;
  notes: string;
};
export type ScheduleItem = {
  id: string;
  time: string;
  title: string;
  description: string;
};
export type GearItem = {
  id: string;
  name: string;
  quantity: number;
  cost: number;
  category: "bring" | "rental" | "shared";
};
export type Announcement = { id: string; body: string; createdAt: string };
export type Poll = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; votes: number }>;
  myVote?: string;
};
export type EventDetail = {
  event: Event;
  guests: Guest[];
  schedule: ScheduleItem[];
  gear: GearItem[];
  announcements: Announcement[];
  polls: Poll[];
  isOwner: boolean;
  currentGuest: Guest | null;
  guestEditToken: string | null;
};
export type SiteSettings = {
  registrationEnabled: boolean;
  eventCreationEnabled: boolean;
  siteNotice: string;
};
export type AdminOverview = {
  users: number;
  events: number;
  guests: number;
  upcomingEvents: number;
  recentActivity: Array<{
    id: string;
    action: string;
    detail: string;
    createdAt: string;
  }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    eventCount: number;
  }>;
  recentEvents: Array<{
    id: string;
    title: string;
    ownerName: string;
    date: string;
    guestCount: number;
  }>;
  settings: SiteSettings;
};

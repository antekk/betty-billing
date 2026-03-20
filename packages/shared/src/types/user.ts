import type { SubscriptionStatus } from "../constants";

export interface User {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  billingPreferences: Record<string, unknown> | null;
  ahcipPractitionerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  pushToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

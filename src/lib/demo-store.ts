import { ConversationState } from "./financial-engine/types";

export interface DemoParticipant {
  id: string;
  participantCode: string;
  consent: boolean;
  currentStep: number;
  isCompleted: boolean;
  disqualified: boolean;
  disqualifiedReason?: string;
  demographics?: Record<string, unknown>;
  cellNumber?: number;
  scenarioId?: string;
  condition?: "basic" | "context_aware";
  sessionId?: string;
  earlyDecision?: Record<string, unknown>;
  finalDecision?: Record<string, unknown>;
  postQuestionnaire?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DemoSession {
  id: string;
  participantCode: string;
  scenarioId: string;
  condition: "basic" | "context_aware";
  currentAction: Record<string, unknown>;
  status: string;
  followupCount: number;
  maxFollowupAllowed: number;
  promptVersion: string;
  modelId: string;
  conversationState?: ConversationState;
}

export interface DemoMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  calculationSnapshot?: Record<string, unknown> | null;
  sourcesUsed?: string[];
  extractedIntent?: Record<string, unknown>;
}

// Global in-memory storage for development / preview when Cloud PostgreSQL is not yet attached
declare global {
  // eslint-disable-next-line no-var
  var __demoParticipants: Map<string, DemoParticipant> | undefined;
  // eslint-disable-next-line no-var
  var __demoSessions: Map<string, DemoSession> | undefined;
  // eslint-disable-next-line no-var
  var __demoMessages: Map<string, DemoMessage[]> | undefined;
}

export const demoParticipants: Map<string, DemoParticipant> =
  globalThis.__demoParticipants ?? (globalThis.__demoParticipants = new Map());

export const demoSessions: Map<string, DemoSession> =
  globalThis.__demoSessions ?? (globalThis.__demoSessions = new Map());

export const demoMessages: Map<string, DemoMessage[]> =
  globalThis.__demoMessages ?? (globalThis.__demoMessages = new Map());

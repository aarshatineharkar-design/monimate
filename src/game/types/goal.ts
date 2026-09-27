/**
 * MoniMate 2.0 — GoalState: player-declared goals, kept separate from mission objectives.
 * A mission objective is scripted, time-boxed, and owned by MissionSystem/MissionDef; a goal is
 * longer-lived and either player-chosen or campaign-seeded, with no window/expiry of its own.
 */

export type GoalKind = 'financial' | 'personal' | 'story';

export interface FinancialGoal {
  id: string;
  kind: 'financial';
  name: string;
  target: number;
  saved: number;
}

export interface PersonalGoal {
  id: string;
  kind: 'personal';
  description: string;
  completed: boolean;
}

export interface StoryGoal {
  id: string;
  kind: 'story';
  description: string;
  completed: boolean;
}

export type Goal = FinancialGoal | PersonalGoal | StoryGoal;

export interface GoalState {
  active: Goal[];
  completed: Goal[];
}

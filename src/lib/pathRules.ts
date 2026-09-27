/**
 * MoniMate — what changes between life paths. Blueprint section 26: "SAME ENGINE… only the content
 * and rules change." Everything the engine and the UI used to hard-code for the School path (the
 * week's goals, who lives in the world, what the school building is called, when class starts, what
 * the calendar says, which mission pays the week's money and which one wraps it up) lives here, one
 * entry per path. The store, the HUD and the phone read these rules instead of checking
 * `lifePath === 'school'`.
 */
import { hm } from './clock';
import { UNI_WEEK_GOALS, WEEK_GOALS, type LifePath, type WeekGoalDef } from './gameData';

export interface StudyRules {
  /** when the lesson starts (minute of day) — arrive early and you can wait for it */
  bell: number;
  /** the last minute you can still sit down for it */
  lastStart: number;
  /** how long it takes and what it costs */
  minutes: number;
  energy: number;
  noun: string;            // 'class' | 'lecture'
  teacher: string;         // who says "take your seat"
  roomName: string;        // where it happens
  roomHint: string;        // how to find it from the entrance
}

export interface PathRules {
  id: LifePath;
  goals: WeekGoalDef[];
  goalTips: Record<string, string>;
  /** NPC ids that exist in this path's world (Mr Lee at the Dairy is in every path) */
  cast: string[];
  relationships: Record<string, number>;
  contacts: { key: string; id?: string; note: string }[];
  calendar: { day: number; icon: string; text: string; missionId?: string }[];
  study: StudyRules | null;
  /** building names that differ on this path (the 'university' place is "School" for a kid) */
  placeNames: Record<string, string>;
  /** word swaps for room, door and bus-stop labels ("Leave school" → "Leave campus") */
  swaps: [string, string][];
  /** the mission that starts the week (hands over the week's money) and the one that ends it */
  weekStart: string;
  recap: string;
  savings: { name: string; emoji: string; atHome: boolean };
  /** who says hello in the idle-chat fallback, and the default "Free time" hint */
  freeTimeHint: string;
}

const SCHOOL: PathRules = {
  id: 'school',
  goals: WEEK_GOALS,
  goalTips: {
    save_event: "Tip: put money in the piggy bank at home so you don't spend it by accident. Take it out on Saturday morning.",
    arcade: "Tip: Jordan's arcade run is Thursday after school at the Mall. It's $8 — keep it free.",
    buy_headphones: 'Tip: $15 is a lot of lunches. Walk, pack lunch, and say yes to paid jobs.',
    friends: "Tip: Riley's birthday is Wednesday–Thursday. Show up for people — it doesn't always cost money.",
  },
  cast: ['mum', 'jordan', 'riley', 'teacher', 'shopkeeper'],
  relationships: { Mum: 3, Jordan: 2, Riley: 1 },
  contacts: [
    { key: 'Mum', id: 'mum', note: 'Pays for chores. Home before 8 and after 5:30.' },
    { key: 'Jordan', id: 'jordan', note: 'Loves the arcade. Impulsive spender.' },
    { key: 'Riley', id: 'riley', note: 'Social but careful with money.' },
    { key: 'Ms Patel', id: 'teacher', note: 'Your teacher. Classroom, weekdays.' },
  ],
  calendar: [
    { day: 0, icon: '💵', text: 'Pocket money · pick your goal', missionId: 'pocket_money' },
    { day: 0, icon: '🛒', text: "Mum's grocery errand", missionId: 'pickup_groceries' },
    { day: 1, icon: '🏀', text: 'Basketball sign-up at lunch ($6)', missionId: 'sports_signup' },
    { day: 2, icon: '📐', text: 'Project supplies due (5:30 PM)', missionId: 'school_project' },
    { day: 2, icon: '🎂', text: "Riley's birthday (Wed–Thu)", missionId: 'friend_birthday' },
    { day: 3, icon: '🕹️', text: 'Arcade with Jordan · Dairy shift', missionId: 'arcade_invite' },
    { day: 4, icon: '🖼️', text: 'Project presentations after class', missionId: 'project_day' },
    { day: 4, icon: '🏀', text: 'Basketball game 4 PM (if you signed up)', missionId: 'team_game' },
    { day: 5, icon: '🎟️', text: 'School fair 10–2 ($10)', missionId: 'school_fair' },
    { day: 6, icon: '📅', text: 'Sunday night with Mum', missionId: 'friday_recap' },
  ],
  study: {
    bell: hm(8, 30), lastStart: hm(11, 30), minutes: 240, energy: 15,
    noun: 'class', teacher: 'Ms Patel', roomName: 'Classroom',
    roomHint: 'Class is in the Classroom — first door on the left of the hallway',
  },
  placeNames: { university: 'School' },
  swaps: [],
  weekStart: 'pocket_money',
  recap: 'friday_recap',
  savings: { name: 'Piggy bank', emoji: '🐷', atHome: true },
  freeTimeHint: 'Free time — explore',
};

const UNIVERSITY: PathRules = {
  id: 'university',
  goals: UNI_WEEK_GOALS,
  goalTips: {
    uni_buffer: 'Tip: move money into Savings from the Bank app the moment StudyLink lands — what you can\'t see, you don\'t spend.',
    uni_job: 'Tip: Student Job Search posts jobs on Tuesday. Apply, nail Wednesday\'s interview at the Café and turn up Friday.',
    uni_ready: "Tip: get the textbook sorted by Wednesday (new, second-hand or the library) and do Friday's quiz.",
    uni_social: 'Tip: join a club on Tuesday and keep things good with Sam and Mei. Saying yes doesn\'t always cost money.',
  },
  cast: ['sam', 'mei', 'lecturer', 'leah', 'shopkeeper'],
  relationships: { Mum: 3, Sam: 2, Mei: 0, Leah: 0 },
  contacts: [
    { key: 'Sam', id: 'sam', note: 'Your flatmate. Collects the rent, loves Sky Sport.' },
    { key: 'Mei', id: 'mei', note: 'In your ECON101 lectures. Organised, always in the library.' },
    { key: 'Leah', id: 'leah', note: 'Runs the Café. Hiring part-time staff.' },
    { key: 'Mum', note: 'Back home. Video calls on Sunday.' },
  ],
  calendar: [
    { day: 0, icon: '🎓', text: 'StudyLink pays $316 · pick your goal', missionId: 'uni_payday' },
    { day: 0, icon: '🏠', text: 'Rent due — $200 to Sam', missionId: 'uni_rent' },
    { day: 0, icon: '📕', text: 'First ECON101 lecture (10 AM)', missionId: 'uni_first_lecture' },
    { day: 1, icon: '🎪', text: 'Clubs Day in the campus hub', missionId: 'uni_clubs_day' },
    { day: 1, icon: '💼', text: 'Job ads go up (Student Job Search)', missionId: 'uni_job_hunt' },
    { day: 2, icon: '☕', text: 'Café interview (if you applied)', missionId: 'uni_interview' },
    { day: 2, icon: '📕', text: 'Textbook sorted by 5:30 PM', missionId: 'uni_textbook' },
    { day: 3, icon: '⚡', text: 'Flat power bill · phone bill ($40, automatic)', missionId: 'uni_power_bill' },
    { day: 4, icon: '💻', text: 'ECON101 quiz due tonight', missionId: 'uni_quiz' },
    { day: 4, icon: '☕', text: 'Trial shift at the Café (if offered)', missionId: 'uni_trial_shift' },
    { day: 5, icon: '🏖️', text: 'Flat trip to Raglan?', missionId: 'uni_raglan' },
    { day: 6, icon: '📹', text: 'Sunday video call with Mum', missionId: 'uni_recap' },
  ],
  study: {
    bell: hm(10), lastStart: hm(11), minutes: 120, energy: 10,
    noun: 'lecture', teacher: 'Dr Hughes', roomName: 'Lecture Theatre',
    roomHint: 'ECON101 is in the Lecture Theatre — first door on the left of the hub',
  },
  placeNames: { university: 'University', shop_small: 'Bookshop' },
  swaps: [
    ['School Hallway', 'Campus Hub'], ['Classroom', 'Lecture Theatre'], ['classroom', 'lecture theatre'],
    ['Cafeteria', 'Student Café'], ['cafeteria', 'student café'], ['Gym', 'Rec Centre'], ['gym', 'rec centre'],
    ['School Gate', 'Campus Gate'], ['Leave school', 'Leave campus'], ['Back to hallway', 'Back to the hub'],
    ['Your Room', 'Your Flat'],
  ],
  weekStart: 'uni_payday',
  recap: 'uni_recap',
  savings: { name: 'Savings account', emoji: '🏦', atHome: false },
  freeTimeHint: 'Free time — explore the city',
};

/** Paths without content yet borrow School's rules so nothing crashes; the path-select screen keeps
 *  them locked ("Coming soon") until their own entry exists. */
const RULES: Record<LifePath, PathRules> = {
  school: SCHOOL,
  university: UNIVERSITY,
  international: { ...SCHOOL, id: 'international' },
  working: { ...SCHOOL, id: 'working' },
};

export const pathRules = (path: LifePath): PathRules => RULES[path] ?? SCHOOL;

/** A building's name on this path (the 'university' building is "School" for a school kid). */
export function placeName(path: LifePath, placeId: string, fallback?: string): string {
  return pathRules(path).placeNames[placeId] ?? fallback ?? placeId;
}

/** Room names, door labels and stop names, reworded for this path. */
export function pathText(path: LifePath, text: string): string {
  let out = text;
  for (const [from, to] of pathRules(path).swaps) out = out.split(from).join(to);
  return out;
}

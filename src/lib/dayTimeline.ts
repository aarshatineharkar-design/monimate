// Time is tracked as minutes since 7:00 AM
// 7:00 AM = 0, 8:00 AM = 60, 12:30 PM = 330, 3:00 PM = 480, 7:00 PM = 720

export const TIME_SCHOOL_START = 60;   // 8:00 AM
export const TIME_LUNCH = 330;          // 12:30 PM
export const TIME_SCHOOL_END = 480;     // 3:00 PM
export const TIME_HOME_DEADLINE = 720;  // 7:00 PM
export const CAMP_GOAL = 50;

export function formatTime(minutes: number): string {
  const totalMin = minutes;
  const hours = Math.floor(totalMin / 60) + 7;
  const mins = totalMin % 60;
  const h = hours > 12 ? hours - 12 : hours;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

export function getTimeOfDay(minutes: number): 'morning' | 'school' | 'lunch' | 'afternoon' | 'evening' {
  if (minutes < TIME_SCHOOL_START) return 'morning';
  if (minutes < TIME_LUNCH) return 'school';
  if (minutes < TIME_LUNCH + 30) return 'lunch';
  if (minutes < TIME_SCHOOL_END) return 'school';
  if (minutes < TIME_HOME_DEADLINE) return 'afternoon';
  return 'evening';
}

export interface TimeEvent {
  id: string;
  time: number; // minutes since 7 AM
  location: string;
  type: 'story' | 'choice' | 'travel' | 'errand' | 'social' | 'alert';
  speaker?: string;
  speakerEmoji?: string;
  text: string;
  choices?: TimeChoice[];
  autoAdvance?: boolean; // skip to next event automatically
  duration?: number; // how long this takes in game-minutes
}

export interface TimeChoice {
  label: string;
  emoji: string;
  walletChange: number;
  timeCost: number; // minutes consumed
  healthChange: number;
  reputationChange: number; // social standing
  flag?: string;
  response: string;
  travelTo?: string; // changes current location
}

export interface DayData {
  week: number;
  day: number;
  dayName: string;
  morningMessage: string;
  weather: 'sunny' | 'rainy' | 'cloudy';
  momErrand?: MomErrand;
  events: TimeEvent[];
}

export interface MomErrand {
  text: string;
  emoji: string;
  itemCost: number;
  timeCost: number;
  reward: number;
  location: string;
}

// ============================================================
// DAY 1 — MONDAY: The Big Announcement
// ============================================================
const DAY_1: DayData = {
  week: 1, day: 1, dayName: 'Monday',
  morningMessage: "Your alarm goes off. First day of the week. Mum left $15 on the kitchen counter.",
  weather: 'sunny',
  events: [
    // 7:00 AM - Wake up
    {
      id: 'd1-wake', time: 0, location: 'home', type: 'story',
      text: "You grab the $15 and shove it in your pocket. Mum's making toast in the kitchen.",
    },
    {
      id: 'd1-mom', time: 5, location: 'home', type: 'story',
      speaker: 'Mum', speakerEmoji: '👩',
      text: "\"Morning! Don't forget your lunch is in the fridge. Oh, and pick up some milk on your way home today — we're completely out.\"",
    },
    {
      id: 'd1-lunch-decision', time: 10, location: 'home', type: 'choice',
      text: "Your packed lunch is in the fridge. But making it takes 5 minutes and you're already running behind...",
      choices: [
        { label: "Grab the packed lunch", emoji: '🥪', walletChange: 0, timeCost: 5, healthChange: 3, reputationChange: 0,
          flag: 'has_packed_lunch_d1',
          response: "You grab the container. Sandwiches, an apple, and a muesli bar. Not exciting, but it's free. Your wallet stays at $15." },
        { label: "Skip it — I'll buy lunch", emoji: '💨', walletChange: 0, timeCost: 0, healthChange: -2, reputationChange: 0,
          response: "You rush out the door empty-handed. You'll figure out lunch later. Probably at the tuck shop. Probably $5-8 lighter." },
      ],
    },

    // 7:15 AM - Transport to school
    {
      id: 'd1-transport', time: 15, location: 'home', type: 'travel',
      text: "Time to get to school. It starts at 8:00 — you've got 45 minutes.",
      choices: [
        { label: "Walk (free, 30 min)", emoji: '🚶', walletChange: 0, timeCost: 30, healthChange: 2, reputationChange: 0,
          travelTo: 'school',
          response: "You walk. It's a nice morning. Earbuds in, good playlist. Free transport. You arrive at 7:45 — 15 minutes to spare." },
        { label: "Take the bus ($2.50, 12 min)", emoji: '🚌', walletChange: -2.50, timeCost: 12, healthChange: 0, reputationChange: 0,
          travelTo: 'school',
          response: "You tap your card — $2.50 gone. But you're at school by 7:27. Plenty of time. Speed costs money." },
        { label: "Ask Dad for a lift (free, 8 min)", emoji: '🚗', walletChange: 0, timeCost: 8, healthChange: 0, reputationChange: 1,
          travelTo: 'school', flag: 'dad_drove_d1',
          response: "\"Hop in.\" Dad drops you right at the gate. Free, fast, and you've got 37 minutes before class. The premium option — when it's available." },
      ],
    },

    // 8:00 AM - Assembly
    {
      id: 'd1-assembly-1', time: 60, location: 'school', type: 'story',
      text: "Assembly. The whole year level packs into the hall. Mr. Thompson walks up to the mic.",
    },
    {
      id: 'd1-assembly-2', time: 62, location: 'school', type: 'story',
      speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫',
      text: "\"Big announcement. The Year 10 camp trip is confirmed — six weeks from today. Queenstown. Three days of hiking, jet boating, and the famous night market.\"",
    },
    {
      id: 'd1-assembly-3', time: 64, location: 'school', type: 'story',
      text: "The hall explodes. Everyone's whispering, high-fiving, already planning.",
    },
    {
      id: 'd1-assembly-4', time: 66, location: 'school', type: 'story',
      speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫',
      text: "\"School covers transport and accommodation. BUT — you'll need $50 spending money for activities and food. That's YOUR responsibility. Money due in six weeks.\"",
    },
    {
      id: 'd1-assembly-5', time: 68, location: 'school', type: 'story',
      speaker: 'Jake', speakerEmoji: '😎',
      text: "\"Fifty bucks? That's nothing. My parents already Venmo'd me $60.\"",
    },
    {
      id: 'd1-assembly-6', time: 70, location: 'school', type: 'story',
      speaker: 'Mia', speakerEmoji: '🤓',
      text: "\"I've got $20 saved already. $30 more in six weeks... that's $5 a week. Doable.\"",
    },
    {
      id: 'd1-assembly-7', time: 72, location: 'school', type: 'story',
      speaker: 'Liam', speakerEmoji: '😅',
      text: "\"I spent my last $5 yesterday on chips. I'm literally at zero. I'm SO cooked.\"",
    },
    {
      id: 'd1-assembly-8', time: 74, location: 'school', type: 'story',
      text: "You check your pocket. $15. Six weeks. $50 to save. The clock starts now.\n\n🎯 NEW GOAL: Save $50 for camp in 6 weeks",
    },

    // 12:30 PM - Lunch
    {
      id: 'd1-lunch', time: 330, location: 'school', type: 'choice',
      text: "Lunch time. The tuck shop queue is already long. The smell of pies fills the corridor.",
      choices: [
        { label: "Eat packed lunch (free)", emoji: '🥪', walletChange: 0, timeCost: 20, healthChange: 3, reputationChange: 0,
          response: "You eat your sandwich at the bench. Jake walks past with a pie, juice, AND a cookie. \"Packed lunch? Really?\" You shrug. Your $15 is still $15." },
        { label: "Mince pie + juice ($8.50)", emoji: '🥧', walletChange: -8.50, timeCost: 15, healthChange: -2, reputationChange: 1,
          response: "The pie IS incredible. You and Jake eat together. But as you lick your fingers, the maths hits: $15 - $8.50 = $6.50 left. For the whole week. And you haven't saved a single dollar for camp." },
        { label: "Just a cookie ($2)", emoji: '🍪', walletChange: -2, timeCost: 10, healthChange: 0, reputationChange: 0,
          response: "A cookie is enough. $2 spent instead of $8.50 — that's $6.50 saved by making one different choice. Small wins add up." },
      ],
    },

    // 3:00 PM - School ends
    {
      id: 'd1-schoolend', time: 480, location: 'school', type: 'story',
      text: "3:00 PM. Bell rings. You've got until 7:00 PM before Mum expects you home. Four hours. What do you do with them?",
    },
    {
      id: 'd1-afternoon-choice', time: 485, location: 'school', type: 'choice',
      text: "Jake's heading to the dairy. Mia's going to the library. Liam's going... wherever Liam goes. And Mum asked you to pick up milk.",
      choices: [
        { label: "Dairy with Jake (30 min)", emoji: '🏪', walletChange: 0, timeCost: 30, healthChange: 0, reputationChange: 2,
          travelTo: 'dairy', flag: 'went_dairy_d1',
          response: "You walk to the dairy with Jake. The snack shelves are calling your name. Chips, drinks, chocolate — everything is $2-4 and it ALL looks good." },
        { label: "Library with Mia (60 min)", emoji: '📚', walletChange: 0, timeCost: 60, healthChange: 3, reputationChange: 1,
          travelTo: 'library', flag: 'went_library_d1',
          response: "You go to the library. Mia's already got her books out. \"Smart choice,\" she says. No spending temptation here — just free WiFi and quiet." },
        { label: "Straight home to save money", emoji: '🏠', walletChange: 0, timeCost: 25, healthChange: 2, reputationChange: -1,
          travelTo: 'home', flag: 'went_home_d1',
          response: "You head straight home. Jake yells \"Boring!\" but you're already walking. Less time out = less temptation = more money saved." },
      ],
    },

    // Dairy scene (if they chose dairy)
    {
      id: 'd1-dairy-scene', time: 520, location: 'dairy', type: 'choice',
      speaker: 'Jake', speakerEmoji: '😎',
      text: "\"Come on, get something! I'm getting chips AND a chocolate bar. Don't be weird.\"",
      choices: [
        { label: "Chips + drink ($6.50)", emoji: '🍟', walletChange: -6.50, timeCost: 15, healthChange: -3, reputationChange: 2,
          response: "You and Jake munch chips on the walk home. Fun? Yes. Expensive? $6.50 for 15 minutes of snacking. That's almost half a day's pocket money." },
        { label: "Just chips ($2.50)", emoji: '🍟', walletChange: -2.50, timeCost: 15, healthChange: -1, reputationChange: 1,
          response: "\"Just chips? No drink?\" Jake looks at you weird. $2.50 is way less than $6.50 though. You made the social appearance without the full damage." },
        { label: "\"Nah I'm good, just hanging\"", emoji: '🙅', walletChange: 0, timeCost: 15, healthChange: 3, reputationChange: -1,
          response: "Jake stares. \"You came to the dairy... to NOT buy anything?\" Awkward. But you saved $0 and you're still hanging with your mate. That's a skill." },
      ],
    },

    // Milk errand
    {
      id: 'd1-milk', time: 600, location: 'dairy', type: 'choice',
      text: "Oh wait — Mum asked you to pick up milk! The dairy sells it for $4.50. If you don't get it, she'll be annoyed. But if you do...",
      choices: [
        { label: "Buy the milk ($4.50)", emoji: '🥛', walletChange: -4.50, timeCost: 0, healthChange: 2, reputationChange: 2,
          flag: 'bought_milk_d1',
          response: "You grab the milk. $4.50 gone — but Mum will be happy, and happy Mum sometimes means bonus pocket money or a lift to school tomorrow." },
        { label: "\"Forgot\" (save the money)", emoji: '🤷', walletChange: 0, timeCost: 0, healthChange: -3, reputationChange: -2,
          flag: 'forgot_milk_d1',
          response: "You \"forget.\" Your wallet is heavier, but when Mum asks tonight... let's just say there will be a conversation." },
      ],
    },

    // Getting home
    {
      id: 'd1-gohome', time: 650, location: 'dairy', type: 'travel',
      text: "It's getting late. Home is 25 minutes on foot or 8 minutes by bus ($2.50). Mum said 7:00 PM.",
      choices: [
        { label: "Walk home (free, 25 min)", emoji: '🚶', walletChange: 0, timeCost: 25, healthChange: 1, reputationChange: 0,
          travelTo: 'home',
          response: "You walk. Should get home around 6:55 — cutting it close but doable." },
        { label: "Bus home ($2.50, 8 min)", emoji: '🚌', walletChange: -2.50, timeCost: 8, healthChange: 0, reputationChange: 0,
          travelTo: 'home',
          response: "You catch the bus. Home by 6:40 with 20 minutes to spare. Fast but expensive — two bus trips in one day is $5 on transport alone." },
      ],
    },

    // Home - evening
    {
      id: 'd1-home-evening', time: 700, location: 'home', type: 'story',
      text: "You're home. Day 1 is done.",
    },
    {
      id: 'd1-mom-check', time: 705, location: 'home', type: 'story',
      speaker: 'Mum', speakerEmoji: '👩',
      text: "\"You're on time. Good. Did you get the milk?\"",
    },
    {
      id: 'd1-piggybank', time: 710, location: 'home', type: 'choice',
      text: "Before bed, you look at your piggy bank on the shelf. Empty. $50 to save. Six weeks.\n\nHow much do you want to save tonight?",
      choices: [
        { label: "Save $5", emoji: '🐷', walletChange: -5, timeCost: 0, healthChange: 5, reputationChange: 0,
          response: "You drop $5 in the piggy bank. It clinks. $5 down, $45 to go. It's a start." },
        { label: "Save $2", emoji: '🐷', walletChange: -2, timeCost: 0, healthChange: 2, reputationChange: 0,
          response: "Two dollars in the piggy bank. Small start, but a start. $48 more to go." },
        { label: "Save nothing tonight", emoji: '😬', walletChange: 0, timeCost: 0, healthChange: -2, reputationChange: 0,
          response: "You stare at the piggy bank but keep walking. \"I'll save tomorrow.\" The piggy bank stares back, empty." },
      ],
    },
    {
      id: 'd1-end', time: 720, location: 'home', type: 'story',
      text: "You climb into bed. Day 1 is done. Five more days this week. Six weeks to camp.\n\nThe piggy bank sits on the shelf in the dark. Waiting.",
    },
  ],
};

// ============================================================
// DAY 2 — TUESDAY: The Stationery Crisis
// ============================================================
const DAY_2: DayData = {
  week: 1, day: 2, dayName: 'Tuesday',
  morningMessage: "Tuesday. No new money today — whatever's in your pocket is what you've got.",
  weather: 'cloudy',
  momErrand: {
    text: "Pick up sticky tape from the stationery shop — I need it for your sister's project",
    emoji: '📎',
    itemCost: 3.50,
    timeCost: 15,
    reward: 2,
    location: 'stationery',
  },
  events: [
    {
      id: 'd2-wake', time: 0, location: 'home', type: 'story',
      text: "You check your pocket. Whatever you didn't spend or save yesterday — that's what you've got for today.",
    },
    {
      id: 'd2-mom-errand', time: 5, location: 'home', type: 'story',
      speaker: 'Mum', speakerEmoji: '👩',
      text: "\"Oh! Before I forget — can you grab sticky tape from the stationery shop after school? Here's $5 for it. Bring me the change.\"",
    },
    {
      id: 'd2-text', time: 8, location: 'home', type: 'story',
      text: "📱 Group chat notification:\n\nJake: \"Art class today, does anyone have a spare glue stick? Mrs Chen said we NEED one\"\nMia: \"I've got extras. I'll bring one for you Jake\"\nJake: \"Legend\"",
    },
    {
      id: 'd2-gluestion', time: 10, location: 'home', type: 'choice',
      text: "Do you need a glue stick too? You used your last one last week. The stationery shop on the way to school has them for $3.50. But Mia might have a spare...",
      choices: [
        { label: "Buy one on the way ($3.50, +15 min)", emoji: '🛒', walletChange: -3.50, timeCost: 15, healthChange: 1, reputationChange: 0,
          flag: 'bought_glue_d2',
          response: "You detour to the stationery shop. $3.50 gone but you've got what you need. Takes 15 extra minutes though — you'll need to hurry to school." },
        { label: "Ask Mia if she has a spare", emoji: '🤓', walletChange: 0, timeCost: 0, healthChange: 2, reputationChange: 1,
          flag: 'asked_mia_glue_d2',
          response: "You text Mia: \"Got a spare for me too?\" Reply: \"Sure! I always buy multi-packs when they're on sale 😊\" Free glue stick. Smart friends = saved money." },
        { label: "Risk it — maybe I won't need it", emoji: '🤞', walletChange: 0, timeCost: 0, healthChange: -3, reputationChange: -1,
          flag: 'no_glue_d2',
          response: "You gamble. If Mrs Chen makes you use one today, you're in trouble. If she doesn't, you saved $3.50. Risky." },
      ],
    },

    // Transport
    {
      id: 'd2-transport', time: 20, location: 'home', type: 'travel',
      text: "Time to get to school. It's a cloudy morning — not raining yet, but it might.",
      choices: [
        { label: "Walk (free, 30 min)", emoji: '🚶', walletChange: 0, timeCost: 30, healthChange: 1, reputationChange: 0,
          travelTo: 'school',
          response: "You walk. Clouds look threatening but hold off. Made it dry. $0 spent on transport." },
        { label: "Bus ($2.50, 12 min)", emoji: '🚌', walletChange: -2.50, timeCost: 12, healthChange: 0, reputationChange: 0,
          travelTo: 'school',
          response: "Bus it is. $2.50 gone but you're there with time to spare." },
      ],
    },

    // School - Art class
    {
      id: 'd2-artclass', time: 120, location: 'school', type: 'story',
      text: "Art class. Mrs Chen hands out the project sheets. \"You'll need glue sticks, coloured paper, and scissors. No glue stick, no project, no marks.\"",
    },
    {
      id: 'd2-glue-consequence', time: 125, location: 'school', type: 'story',
      text: "You check your bag...",
    },

    // Lunch
    {
      id: 'd2-lunch', time: 330, location: 'school', type: 'choice',
      text: "Lunch time. Jake is heading to the tuck shop. Again.",
      speaker: 'Jake', speakerEmoji: '😎',
      choices: [
        { label: "Packed lunch (free)", emoji: '🥪', walletChange: 0, timeCost: 20, healthChange: 3, reputationChange: 0,
          response: "You eat your lunch on the field. Jake waves his sushi pack at you from the tuck shop line. You wave your free sandwich back." },
        { label: "Sushi pack ($5)", emoji: '🍣', walletChange: -5, timeCost: 15, healthChange: 0, reputationChange: 1,
          response: "The sushi is fresh today. But $5 is a third of a day's pocket money for one meal." },
        { label: "Cheese roll ($2.50)", emoji: '🧀', walletChange: -2.50, timeCost: 10, healthChange: 0, reputationChange: 0,
          response: "Cheap and filling. $2.50 keeps you fed without wrecking the budget." },
      ],
    },

    // After school - Liam incident
    {
      id: 'd2-afterschool', time: 480, location: 'school', type: 'story',
      text: "3:00 PM. Bell goes. As you're packing up, Liam slides up to you.",
    },
    {
      id: 'd2-liam', time: 482, location: 'school', type: 'choice',
      speaker: 'Liam', speakerEmoji: '😅',
      text: "\"Bro. I'm literally starving. I haven't eaten all day — I forgot my lunch and I've got zero dollars. Can I please borrow $4? I'll Venmo you tonight, I SWEAR.\"",
      choices: [
        { label: "\"Here's $4\"", emoji: '💸', walletChange: -4, timeCost: 0, healthChange: -2, reputationChange: 2,
          flag: 'lent_liam_d2',
          response: "Liam lights up. \"You're a LEGEND.\" He sprints to the tuck shop. $4 gone. Will he actually Venmo you tonight? History says no." },
        { label: "\"I can give you $2\"", emoji: '🤏', walletChange: -2, timeCost: 0, healthChange: 0, reputationChange: 1,
          flag: 'lent_liam_small_d2',
          response: "\"$2? I guess that gets me a cheese roll...\" He takes it. You helped, but kept the damage small." },
        { label: "\"Sorry man, saving for camp\"", emoji: '🙅', walletChange: 0, timeCost: 0, healthChange: 3, reputationChange: -1,
          flag: 'denied_liam_d2',
          response: "\"Come ON...\" Liam looks hurt. You feel bad. But every dollar you lend is a dollar further from Queenstown." },
      ],
    },

    // Stationery errand
    {
      id: 'd2-errand', time: 500, location: 'school', type: 'choice',
      text: "After school. Mum gave you $5 this morning for sticky tape. The stationery shop is a 15-minute walk from school. Home is 30 minutes in the opposite direction. Going to the shop and then home = about 50 minutes total.",
      choices: [
        { label: "Go get the tape (15 min detour)", emoji: '📎', walletChange: -3.50, timeCost: 50, healthChange: 2, reputationChange: 2,
          travelTo: 'home', flag: 'got_tape_d2',
          response: "You walk to the shop, buy the tape ($3.50), pocket the $1.50 change, and head home. Mum will be happy — and that $1.50 change is yours to keep." },
        { label: "\"Forget\" the errand", emoji: '🤷', walletChange: 0, timeCost: 0, healthChange: -3, reputationChange: -3,
          flag: 'forgot_errand_d2',
          response: "You head straight home. When Mum asks about the tape tonight... well, you'll deal with that later. The $5 is technically hers though." },
        { label: "Go, but keep ALL the change", emoji: '😈', walletChange: -3.50, timeCost: 50, healthChange: -1, reputationChange: -1,
          travelTo: 'home', flag: 'kept_change_d2',
          response: "You buy the tape and pocket all the change. \"They didn't have change\" you'll tell Mum. It's only $1.50 but... is this the kind of money management you want to learn?" },
      ],
    },

    // Walk home (if not already handled)
    {
      id: 'd2-gohome', time: 620, location: 'school', type: 'travel',
      text: "Time to head home. The clouds are getting darker...",
      choices: [
        { label: "Walk fast (free, 25 min)", emoji: '🚶', walletChange: 0, timeCost: 25, healthChange: 0, reputationChange: 0,
          travelTo: 'home',
          response: "You speed-walk. The first drops start falling with 5 minutes to go. You make it home damp but not soaked." },
        { label: "Bus ($2.50, 8 min) — beat the rain", emoji: '🚌', walletChange: -2.50, timeCost: 8, healthChange: 1, reputationChange: 0,
          travelTo: 'home',
          response: "Smart move — it starts POURING two minutes after you get on the bus. You arrive dry. Worth $2.50? Today, maybe yeah." },
      ],
    },

    // Evening
    {
      id: 'd2-evening', time: 690, location: 'home', type: 'story',
      speaker: 'Mum', speakerEmoji: '👩',
      text: "\"You're home on time. Good. Did you get the tape?\"",
    },
    {
      id: 'd2-piggy', time: 710, location: 'home', type: 'choice',
      text: "Piggy bank time. Camp fund check: how much are you putting in tonight?",
      choices: [
        { label: "Save $5", emoji: '🐷', walletChange: -5, timeCost: 0, healthChange: 5, reputationChange: 0,
          response: "Clink. $5 more in the piggy bank. It's starting to feel heavier. Good sign." },
        { label: "Save $3", emoji: '🐷', walletChange: -3, timeCost: 0, healthChange: 3, reputationChange: 0,
          response: "$3 in the bank. Not huge, but consistent saving beats big one-off deposits." },
        { label: "Save nothing", emoji: '😬', walletChange: 0, timeCost: 0, healthChange: -2, reputationChange: 0,
          response: "Nothing tonight. The piggy bank rattles when you bump it. Sounds empty. Because it probably is." },
      ],
    },
    {
      id: 'd2-end', time: 720, location: 'home', type: 'story',
      text: "Day 2 done. The rain hammers the window as you fall asleep. Tomorrow's Wednesday — halfway through the week already.",
    },
  ],
};

// ============================================================
// DAY 3 — WEDNESDAY: The Opportunity
// ============================================================
const DAY_3: DayData = {
  week: 1, day: 3, dayName: 'Wednesday',
  morningMessage: "Wednesday. Middle of the week. Rain cleared overnight but it's cold.",
  weather: 'cloudy',
  events: [
    {
      id: 'd3-wake', time: 0, location: 'home', type: 'story',
      text: "You wake up to your phone buzzing. Group chat is going off.",
    },
    {
      id: 'd3-groupchat', time: 3, location: 'home', type: 'story',
      text: "📱 Group chat:\n\nJake: \"Café after school?? The new place does $6 hot chocolates and they're INSANE\"\nMia: \"I'm in but only if I can get a water 😂\"\nLiam: \"YES I'll borrow money from someone lol\"\nJake: \"@You coming??\"",
    },
    {
      id: 'd3-cafe-decision', time: 5, location: 'home', type: 'choice',
      text: "The café. Everyone's going. Do you commit?",
      choices: [
        { label: "\"Yeah I'm in!\"", emoji: '☕', walletChange: 0, timeCost: 0, healthChange: 0, reputationChange: 3,
          flag: 'promised_cafe_d3',
          response: "You reply \"see you there 💪\". Everyone reacts with 🔥. You're committed now — backing out would look bad." },
        { label: "\"Maybe, depends on how the day goes\"", emoji: '🤔', walletChange: 0, timeCost: 0, healthChange: 0, reputationChange: 1,
          flag: 'maybe_cafe_d3',
          response: "Noncommittal. Smart. You can decide later when you know how your wallet's doing." },
        { label: "\"Can't today sorry\"", emoji: '🙅', walletChange: 0, timeCost: 0, healthChange: 1, reputationChange: -2,
          response: "Jake sends a 😐. Mia sends \"no worries!\". You're free for the afternoon — but you feel the FOMO already." },
      ],
    },

    // Transport
    {
      id: 'd3-transport', time: 20, location: 'home', type: 'travel',
      text: "Time for school. It's cold but dry.",
      choices: [
        { label: "Walk (free, 30 min)", emoji: '🚶', walletChange: 0, timeCost: 30, healthChange: 2, reputationChange: 0,
          travelTo: 'school',
          response: "Cold walk but you're saving $2.50. Your hands are freezing by the time you arrive but your wallet is warm." },
        { label: "Bus ($2.50, 12 min)", emoji: '🚌', walletChange: -2.50, timeCost: 12, healthChange: 0, reputationChange: 0,
          travelTo: 'school',
          response: "Warm bus, quick trip. $2.50 is the price of not freezing." },
      ],
    },

    // School - Opportunity
    {
      id: 'd3-notice', time: 120, location: 'school', type: 'story',
      text: "Walking past the noticeboard at interval, something catches your eye:",
    },
    {
      id: 'd3-job-notice', time: 122, location: 'school', type: 'choice',
      text: "📋 \"HELP NEEDED: Setting up for Friday's school social. Thursday after school, 2 hours. $10 pay. See Mr. Thompson.\"\n\nTen dollars for two hours. That's serious money. But Thursday after school is when the crew usually hangs out...",
      choices: [
        { label: "Sign up for the job", emoji: '✍️', walletChange: 0, timeCost: 0, healthChange: 5, reputationChange: -1,
          flag: 'signed_up_job_d3',
          response: "You write your name on the sheet. $10 is more than half a day's pocket money — and you EARNED it, not just received it. Thursday afternoon is now spoken for." },
        { label: "Nah, Thursday's hangout day", emoji: '🤷', walletChange: 0, timeCost: 0, healthChange: -2, reputationChange: 1,
          response: "You walk past. Hanging with friends matters too. But somewhere in the back of your mind: $10. That's 20% of your camp target. Gone." },
      ],
    },

    // Lunch
    {
      id: 'd3-lunch', time: 330, location: 'school', type: 'choice',
      text: "Lunch. Mia sits next to you with her homemade wrap.",
      speaker: 'Mia', speakerEmoji: '🤓',
      choices: [
        { label: "Packed lunch (free)", emoji: '🥪', walletChange: 0, timeCost: 20, healthChange: 3, reputationChange: 0,
          response: "You and Mia eat together. She shows you her camp savings tracker — a little chart in her notebook. \"You should make one too,\" she says." },
        { label: "Cup noodles ($4)", emoji: '🍜', walletChange: -4, timeCost: 15, healthChange: -1, reputationChange: 0,
          response: "The noodles are hot and salty. Perfect for a cold day. Mia glances at them. \"That's four dollars closer to NOT going jet boating, you know.\"" },
      ],
    },

    // After school - Café scene (if promised)
    {
      id: 'd3-afterschool', time: 480, location: 'school', type: 'story',
      text: "3:00 PM. School's out.",
    },
    {
      id: 'd3-cafe', time: 485, location: 'school', type: 'choice',
      text: "Jake's already heading to the new café. \"Come ON, let's go!\" Mia's going too. Even Liam's tagging along (borrowing money from someone, no doubt).\n\nThe café is 10 minutes away. You'll need to leave by 6:15 to make it home by 7:00.",
      choices: [
        { label: "Go — hot chocolate ($6)", emoji: '☕', walletChange: -6, timeCost: 90, healthChange: -2, reputationChange: 3,
          travelTo: 'cafe', flag: 'cafe_spent_d3',
          response: "The hot chocolate IS insane. Rich, creamy, with actual marshmallows. You all sit there for over an hour, laughing, talking about camp. $6 well spent? Maybe. $6 closer to camp? Definitely not." },
        { label: "Go — just a water ($0)", emoji: '💧', walletChange: 0, timeCost: 90, healthChange: 3, reputationChange: 1,
          travelTo: 'cafe', flag: 'cafe_water_d3',
          response: "\"Just a water, please.\" Jake: \"WATER? At a CAFÉ?\" But Mia nods approvingly. You hang out for an hour, have a great time, and spend nothing. The barista gives you a look but who cares." },
        { label: "Skip the café — go home", emoji: '🏠', walletChange: 0, timeCost: 25, healthChange: 2, reputationChange: -2,
          travelTo: 'home',
          response: "You peel off from the group. \"Where are you going?\" Jake calls. \"Home.\" The FOMO stings, but your wallet doesn't." },
      ],
    },

    // Getting home from café
    {
      id: 'd3-cafe-leave', time: 610, location: 'cafe', type: 'alert',
      text: "⏰ It's 5:10 PM already! The café is 30 minutes walk or 10 minutes by bus from home. Curfew is 7:00 PM.",
    },
    {
      id: 'd3-gohome', time: 615, location: 'cafe', type: 'travel',
      text: "Time to head home.",
      choices: [
        { label: "Walk (free, 30 min)", emoji: '🚶', walletChange: 0, timeCost: 30, healthChange: 1, reputationChange: 0,
          travelTo: 'home',
          response: "You walk. Home by 5:45. Plenty of time. Free transport on a cold day — not glamorous but effective." },
        { label: "Bus ($2.50, 10 min)", emoji: '🚌', walletChange: -2.50, timeCost: 10, healthChange: 0, reputationChange: 0,
          travelTo: 'home',
          response: "Bus gets you home by 5:25. Quick but another $2.50 spent." },
      ],
    },

    // Evening
    {
      id: 'd3-evening', time: 690, location: 'home', type: 'story',
      text: "Home. Warm. Safe. Day 3 of your saving journey.",
    },
    {
      id: 'd3-piggy', time: 710, location: 'home', type: 'choice',
      text: "Piggy bank time. How much tonight?",
      choices: [
        { label: "Save $5", emoji: '🐷', walletChange: -5, timeCost: 0, healthChange: 5, reputationChange: 0,
          response: "Clink. The piggy bank is getting heavier. You can feel the coins shifting inside. Progress." },
        { label: "Save $3", emoji: '🐷', walletChange: -3, timeCost: 0, healthChange: 3, reputationChange: 0,
          response: "$3 more. Every coin counts when you're chasing $50." },
        { label: "Save nothing", emoji: '😬', walletChange: 0, timeCost: 0, healthChange: -2, reputationChange: 0,
          response: "You pass the piggy bank. It doesn't judge you. But you judge yourself a little." },
      ],
    },
    {
      id: 'd3-end', time: 720, location: 'home', type: 'story',
      text: "Wednesday done. Two more days this week. The camp countdown ticks on.",
    },
  ],
};

// ============================================================
// DAY 4 — THURSDAY: The Hustle
// ============================================================
const DAY_4: DayData = {
  week: 1, day: 4, dayName: 'Thursday',
  morningMessage: "Thursday. One more day till the weekend. The week's flying by — is your money flying too?",
  weather: 'sunny',
  events: [
    {
      id: 'd4-wake', time: 0, location: 'home', type: 'story',
      text: "You wake up and immediately check your wallet. How much is left from the $15 you got on Monday?",
    },
    {
      id: 'd4-dad', time: 10, location: 'home', type: 'story',
      speaker: 'Dad', speakerEmoji: '👨',
      text: "\"I'm heading past the school in 10 minutes if you want a lift.\"",
    },
    {
      id: 'd4-transport', time: 15, location: 'home', type: 'travel',
      text: "Free lift from Dad! But you need to be ready in 10 minutes — no detours, no stops.",
      choices: [
        { label: "Take Dad's lift (free, fast!)", emoji: '🚗', walletChange: 0, timeCost: 8, healthChange: 2, reputationChange: 1,
          travelTo: 'school', flag: 'dad_lift_d4',
          response: "Dad drops you at the gate. \"Have a good day, kid.\" Free, warm, fast. This is what being on time and responsible earns you." },
        { label: "\"Nah I'll walk, need the exercise\"", emoji: '🚶', walletChange: 0, timeCost: 30, healthChange: 3, reputationChange: 0,
          travelTo: 'school',
          response: "\"Suit yourself!\" Dad drives off. You walk. It's a beautiful morning, and the walk gives you time to think about your camp savings plan." },
      ],
    },

    // School - Group gift situation
    {
      id: 'd4-groupgift', time: 120, location: 'school', type: 'choice',
      text: "At interval, your classmate Amy comes around with a card.\n\n\"We're collecting $3 each for Mr. Thompson's birthday present — it's next week. He's been such a good teacher. Everyone's chipping in.\"",
      speaker: 'Amy', speakerEmoji: '🎀',
      choices: [
        { label: "Chip in $3", emoji: '🎁', walletChange: -3, timeCost: 0, healthChange: 1, reputationChange: 3,
          flag: 'group_gift_d4',
          response: "You hand over $3. Amy writes your name on the card. Mr. Thompson's a good teacher — and being known as generous doesn't hurt your reputation." },
        { label: "\"I'll chip in $1\"", emoji: '🪙', walletChange: -1, timeCost: 0, healthChange: 0, reputationChange: 1,
          response: "\"A dollar?\" Amy's smile tightens slightly. \"Sure, every bit helps.\" It's less than everyone else gave, but it's something." },
        { label: "\"Sorry, saving for camp\"", emoji: '🙅', walletChange: 0, timeCost: 0, healthChange: 2, reputationChange: -2,
          response: "Amy nods slowly. \"Oh... okay.\" She moves on. You notice a few classmates giving you a look. Social cost: real. Financial cost: zero." },
      ],
    },

    // Lunch
    {
      id: 'd4-lunch', time: 330, location: 'school', type: 'choice',
      text: "Lunch. It's sunny and everyone's eating outside. The tuck shop has a Thursday special: pizza slice for $4.50.",
      choices: [
        { label: "Packed lunch outside (free)", emoji: '🥪', walletChange: 0, timeCost: 20, healthChange: 3, reputationChange: 0,
          response: "Sandwich in the sun. Free, easy, and you spot Mia tracking her savings in her notebook. She's at $28 already. Motivation." },
        { label: "Pizza slice ($4.50)", emoji: '🍕', walletChange: -4.50, timeCost: 15, healthChange: -1, reputationChange: 1,
          response: "The pizza is hot and cheesy and exactly what a Thursday needs. But $4.50 for one slice... that's a lot of cheese for the money." },
        { label: "Share a pizza with someone ($2.25 each)", emoji: '🍕', walletChange: -2.25, timeCost: 15, healthChange: 1, reputationChange: 2,
          response: "You and a classmate split a slice. $2.25 each. Same pizza, half the price. That's a financial hack right there." },
      ],
    },

    // After school - Job OR hangout
    {
      id: 'd4-afterschool', time: 480, location: 'school', type: 'story',
      text: "3:00 PM. Thursday after school.",
    },
    {
      id: 'd4-job-or-hang', time: 485, location: 'school', type: 'choice',
      text: "Two paths:\n\n🔨 If you signed up for the social setup job, Mr. Thompson is waiting in the hall. Two hours, $10.\n\n🏪 If not, Jake and Liam are heading to the mall. \"Come on, just for a bit!\"",
      choices: [
        { label: "Do the setup job ($10, 2 hours)", emoji: '🔨', walletChange: 10, timeCost: 120, healthChange: 5, reputationChange: 2,
          flag: 'did_job_d4', travelTo: 'school',
          response: "Two hours of moving tables, hanging streamers, and testing speakers. Hard work — but when Mr. Thompson hands you a $10 note at the end, it feels DIFFERENT from pocket money. You EARNED this.\n\n💰 +$10 earned!" },
        { label: "Mall with Jake & Liam (2 hours)", emoji: '🛍️', walletChange: 0, timeCost: 120, healthChange: -1, reputationChange: 2,
          travelTo: 'mall', flag: 'went_mall_d4',
          response: "The mall is buzzing. Jake immediately starts looking at speakers for camp. Liam gravitates toward the food court. You're surrounded by things to buy." },
      ],
    },

    // Mall temptation (if they went to mall)
    {
      id: 'd4-mall-temp', time: 550, location: 'mall', type: 'choice',
      speaker: 'Jake', speakerEmoji: '😎',
      text: "\"Bro look — portable Bluetooth speakers, only $35! I'm getting one for camp. You should too!\"",
      choices: [
        { label: "Buy the speaker ($35)", emoji: '🔊', walletChange: -35, timeCost: 15, healthChange: -10, reputationChange: 2,
          flag: 'bought_speaker_d4',
          response: "You buy the speaker. It's cool. But $35 is more than two weeks of pocket money. Your camp fund just got a lot further away. Was it worth it?" },
        { label: "\"Can't afford it right now\"", emoji: '🙅', walletChange: 0, timeCost: 0, healthChange: 3, reputationChange: 0,
          response: "\"I'll just use my phone at camp.\" Jake shrugs. The speaker IS tempting — but $35 is $35. You walk past it." },
        { label: "\"Maybe I'll ask for it for my birthday\"", emoji: '🎂', walletChange: 0, timeCost: 0, healthChange: 2, reputationChange: 1,
          response: "\"Smart — get someone else to pay for it!\" Jake laughs. It's actually a good strategy. Why buy it when someone might gift it?" },
      ],
    },

    // Getting home
    {
      id: 'd4-gohome', time: 650, location: 'mall', type: 'travel',
      text: "Getting late. Time to head home. The mall bus stop is right outside.",
      choices: [
        { label: "Walk (free, 35 min)", emoji: '🚶', walletChange: 0, timeCost: 35, healthChange: 1, reputationChange: 0,
          travelTo: 'home',
          response: "Long walk from the mall but you make it home by 6:50. Just under the wire." },
        { label: "Bus ($2.50, 12 min)", emoji: '🚌', walletChange: -2.50, timeCost: 12, healthChange: 0, reputationChange: 0,
          travelTo: 'home',
          response: "Quick bus ride. Home with time to spare." },
      ],
    },

    // Evening
    {
      id: 'd4-evening', time: 695, location: 'home', type: 'story',
      text: "Home. Thursday's done. One more day this week.",
    },
    {
      id: 'd4-mum-check', time: 700, location: 'home', type: 'story',
      speaker: 'Mum', speakerEmoji: '👩',
      text: "\"How was your day? On time as usual — good kid. Oh, Dad said he can drop you again tomorrow if you want.\"",
    },
    {
      id: 'd4-piggy', time: 710, location: 'home', type: 'choice',
      text: "Piggy bank. The camp deadline is getting closer. Every dollar in here is a dollar closer to jet boating in Queenstown.",
      choices: [
        { label: "Save $5", emoji: '🐷', walletChange: -5, timeCost: 0, healthChange: 5, reputationChange: 0,
          response: "The piggy bank is getting seriously heavy now. That's a good feeling." },
        { label: "Save $3", emoji: '🐷', walletChange: -3, timeCost: 0, healthChange: 3, reputationChange: 0,
          response: "Every bit helps. Consistency beats big gestures." },
        { label: "Save $1", emoji: '🐷', walletChange: -1, timeCost: 0, healthChange: 1, reputationChange: 0,
          response: "A single dollar. It's not much — but it's not nothing either." },
        { label: "Save nothing", emoji: '😬', walletChange: 0, timeCost: 0, healthChange: -2, reputationChange: 0,
          response: "Empty piggy bank, full wallet. But wallets have a way of emptying themselves..." },
      ],
    },
    {
      id: 'd4-end', time: 720, location: 'home', type: 'story',
      text: "Thursday done. Tomorrow is Friday — last day of Week 1. Then the weekend. Then five more weeks of this.\n\nQueenstown is waiting. Is your piggy bank ready?",
    },
  ],
};

export const ALL_DAYS: DayData[] = [DAY_1, DAY_2, DAY_3, DAY_4];

export function getDayData(week: number, day: number): DayData | undefined {
  return ALL_DAYS.find(d => d.week === week && d.day === day);
}

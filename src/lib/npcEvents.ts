export interface NPCEvent {
  id: string;
  npcId: string;
  npcName: string;
  npcEmoji: string;
  triggerWeek: number;
  triggerDay?: number;
  triggerLocation: string;
  dialogue: string;
  choices: NPCChoice[];
  oneTime: boolean;
}

export interface NPCChoice {
  label: string;
  walletChange: number;
  piggyChange: number;
  healthChange: number;
  response: string;
}

export const NPC_EVENTS: NPCEvent[] = [
  // Week 1 - Jake at tuck shop
  {
    id: 'jake-tuckshop-1',
    npcId: 'rich-kid',
    npcName: 'Jake',
    npcEmoji: '😎',
    triggerWeek: 1,
    triggerDay: 2,
    triggerLocation: 'school',
    dialogue: "Yo! I'm getting a pie AND a juice box. You should get the pie combo too — it's so worth it. Only $8.50!",
    choices: [
      { label: "Get the combo ($8.50)", walletChange: -8.50, piggyChange: 0, healthChange: -5,
        response: "Nice one! Jake gives you a fist bump. Your wallet feels a lot lighter though — that's more than half your weekly money gone in one meal." },
      { label: "Just get a cookie ($2)", walletChange: -2, piggyChange: 0, healthChange: 2,
        response: "\"Just a cookie? Alright mate.\" Jake shrugs. But you've still got $13 left for the week — not bad." },
      { label: "Nah, I brought lunch", walletChange: 0, piggyChange: 0, healthChange: 5,
        response: "\"Suit yourself!\" Jake walks off with his pie. You eat your sandwich. Your wallet stays exactly where it was." },
    ],
    oneTime: true,
  },

  // Week 2 - Liam borrowing money
  {
    id: 'liam-borrow-1',
    npcId: 'borrower',
    npcName: 'Liam',
    npcEmoji: '😅',
    triggerWeek: 2,
    triggerDay: 3,
    triggerLocation: 'school',
    dialogue: "Hey... can I borrow $5? I forgot my wallet at home. I'll pay you back tomorrow, promise!",
    choices: [
      { label: "Sure, here's $5", walletChange: -5, piggyChange: 0, healthChange: -3,
        response: "\"Legend! I'll get you back tomorrow!\" Spoiler: tomorrow comes and goes. Liam conveniently forgets. That $5 is probably gone." },
      { label: "I can lend you $2", walletChange: -2, piggyChange: 0, healthChange: 0,
        response: "\"Ah... yeah okay, $2 works.\" Liam takes it. It's less than he asked for, but it's also less for you to lose if he doesn't pay it back." },
      { label: "Sorry, I'm tight this week", walletChange: 0, piggyChange: 0, healthChange: 3,
        response: "\"Aw come on...\" Liam looks disappointed but wanders off to ask someone else. Saying no felt awkward, but your money's still yours." },
    ],
    oneTime: true,
  },

  // Week 2 - Mia at dairy (good influence)
  {
    id: 'mia-dairy-1',
    npcId: 'saver',
    npcName: 'Mia',
    npcEmoji: '🤓',
    triggerWeek: 2,
    triggerLocation: 'dairy',
    dialogue: "I'm not buying anything — I'm saving for concert tickets next month. Already got $25 put away. You saving for anything?",
    choices: [
      { label: "Yeah, I want that $40 game", walletChange: 0, piggyChange: 0, healthChange: 2,
        response: "\"Then skip the dairy today! Every $3 you don't spend here is $3 closer to the game. I do this every week — it actually works.\"" },
      { label: "Nah, just browsing", walletChange: 0, piggyChange: 0, healthChange: 0,
        response: "\"Fair enough. But if you ever want to save for something big, the trick is just... not coming in here every day.\" She laughs." },
      { label: "Saving is boring though", walletChange: 0, piggyChange: 0, healthChange: 0,
        response: "\"Tell that to me when I'm at the concert and you're not!\" She's joking, but... she has a point." },
    ],
    oneTime: true,
  },

  // Week 3 - Jake at dairy (peer pressure)
  {
    id: 'jake-dairy-1',
    npcId: 'rich-kid',
    npcName: 'Jake',
    npcEmoji: '😎',
    triggerWeek: 3,
    triggerLocation: 'dairy',
    dialogue: "I'm getting chips, a drink, AND a chocolate bar. Come on, treat yourself — you only live once right?",
    choices: [
      { label: "Go all in with Jake ($10)", walletChange: -10, piggyChange: 0, healthChange: -8,
        response: "You and Jake walk out loaded with snacks. Fun? Absolutely. Smart? Your wallet just lost two-thirds of your weekly money in one dairy run." },
      { label: "Just chips ($2.50)", walletChange: -2.50, piggyChange: 0, healthChange: 1,
        response: "\"That's it?\" Jake looks at your single bag of chips. But $2.50 is a lot less than $10 — and chips are chips." },
      { label: "I'm good, just hanging out", walletChange: 0, piggyChange: 0, healthChange: 5,
        response: "Jake gives you a weird look but doesn't push it. You hang out, chat, and walk home with your money still in your pocket." },
    ],
    oneTime: true,
  },

  // Week 3 - Liam again
  {
    id: 'liam-borrow-2',
    npcId: 'borrower',
    npcName: 'Liam',
    npcEmoji: '😅',
    triggerWeek: 3,
    triggerDay: 4,
    triggerLocation: 'school',
    dialogue: "Hey so... about that money from last time... I don't have it yet BUT can I borrow another $3? I'm starving.",
    choices: [
      { label: "Fine, here's $3", walletChange: -3, piggyChange: 0, healthChange: -5,
        response: "\"You're the best!\" That's now $8 total Liam owes you. Starting to see a pattern here." },
      { label: "Pay me back first", walletChange: 0, piggyChange: 0, healthChange: 5,
        response: "\"Uhh... yeah... I'll sort it.\" He walks away awkwardly. Setting a boundary felt uncomfortable but it was the right call." },
      { label: "No, sorry", walletChange: 0, piggyChange: 0, healthChange: 3,
        response: "\"Harsh...\" Liam mutters. But you've already lent money you haven't seen back. Fool me twice and all that." },
    ],
    oneTime: true,
  },

  // Week 4 - Mia saving tip
  {
    id: 'mia-home-1',
    npcId: 'saver',
    npcName: 'Mia',
    npcEmoji: '🤓',
    triggerWeek: 4,
    triggerLocation: 'home',
    dialogue: "Hey! Quick tip — I put my savings away FIRST on Monday before I spend anything. That way I never accidentally spend what I meant to save. Try it!",
    choices: [
      { label: "Save $5 right now", walletChange: -5, piggyChange: 5, healthChange: 5,
        response: "You drop $5 in the piggy bank before you can change your mind. Mia grins. \"See? Pay yourself first. Works every time.\"" },
      { label: "Good idea, I'll try next week", walletChange: 0, piggyChange: 0, healthChange: 1,
        response: "\"Don't just say it — do it! Monday, first thing, before the tuck shop even opens.\" She's pushy but she means well." },
      { label: "I need all my money this week", walletChange: 0, piggyChange: 0, healthChange: 0,
        response: "\"That's what everyone says every week. And then there's nothing left by Friday.\" She shrugs. She's not wrong." },
    ],
    oneTime: true,
  },

  // Week 5 - Jake showing off at mall
  {
    id: 'jake-mall-1',
    npcId: 'rich-kid',
    npcName: 'Jake',
    npcEmoji: '😎',
    triggerWeek: 5,
    triggerLocation: 'mall',
    dialogue: "Check it out — new phone case AND a T-shirt. My parents gave me extra this week. You should get something too, there's a sale on!",
    choices: [
      { label: "Buy a T-shirt ($30)", walletChange: -30, piggyChange: 0, healthChange: -10,
        response: "New shirt feels great. But $30 is two full weeks of pocket money. Was it worth it? Only your wallet knows." },
      { label: "Just window shopping today", walletChange: 0, piggyChange: 0, healthChange: 3,
        response: "\"Your loss!\" Jake holds up his shopping bags. But you walk out with the same money you walked in with — and that's not nothing." },
      { label: "Nah, I'm saving for something bigger", walletChange: 0, piggyChange: 0, healthChange: 5,
        response: "\"Saving? For what?\" You tell him about the game. \"Fair enough — that IS a good game.\" Even Jake respects a plan." },
    ],
    oneTime: true,
  },

  // Week 6 - Liam tries to pay back (maybe)
  {
    id: 'liam-payback',
    npcId: 'borrower',
    npcName: 'Liam',
    npcEmoji: '😅',
    triggerWeek: 6,
    triggerDay: 2,
    triggerLocation: 'school',
    dialogue: "Hey! So I finally got some money. Here's $3 back. I know I owe you more but... that's all I've got right now. Sorry.",
    choices: [
      { label: "Thanks, that's a start", walletChange: 3, piggyChange: 0, healthChange: 2,
        response: "You take the $3. It's not everything he owed, but it's something. Lesson learned about lending to friends." },
      { label: "Keep it, we're even", walletChange: 0, piggyChange: 0, healthChange: 0,
        response: "\"Really? Thanks mate!\" Liam looks relieved. You've written off the debt — sometimes friendships cost money." },
    ],
    oneTime: true,
  },
];

export function getAvailableNPCEvent(
  week: number,
  day: number,
  location: string,
  completedEvents: string[]
): NPCEvent | null {
  return NPC_EVENTS.find(e =>
    e.triggerWeek === week &&
    e.triggerLocation === location &&
    !completedEvents.includes(e.id) &&
    (!e.triggerDay || e.triggerDay === day)
  ) || null;
}

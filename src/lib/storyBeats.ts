export interface StoryBeat {
  id: string;
  week: number;
  day: number;
  scenes: StoryScene[];
  freeRoam: boolean; // can player explore locations after scenes?
}

export interface StoryScene {
  id: string;
  speaker: string | null; // null = narrator
  speakerEmoji?: string;
  text: string;
  choices?: StoryChoice[];
  condition?: (state: StoryState) => boolean; // only show if true
}

export interface StoryChoice {
  label: string;
  walletChange: number;
  piggyChange: number;
  healthChange: number;
  flag?: string; // sets a story flag
  nextSceneId?: string; // jump to specific scene
  response: string;
}

export interface StoryState {
  wallet: number;
  piggyBank: number;
  totalSpent: number;
  financialHealth: number;
  flags: Record<string, boolean>;
  campFund: number; // separate savings specifically for camp
}

export const CAMP_GOAL = 45;

export const STORY_BEATS: StoryBeat[] = [
  // ============ WEEK 1 ============

  // MONDAY W1 - The Announcement
  {
    id: 'w1d1', week: 1, day: 1, freeRoam: true,
    scenes: [
      { id: 'w1d1-1', speaker: null, text: "Monday morning. Another week of school. You check your pocket — Mum left $15 on the kitchen counter, same as every Monday." },
      { id: 'w1d1-2', speaker: null, text: "Then, in assembly..." },
      { id: 'w1d1-3', speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫', text: "\"Big announcement, everyone. The Year 10 camp trip is confirmed — six weeks from today. Queenstown. Three days of hiking, kayaking, and probably way too many marshmallows.\"" },
      { id: 'w1d1-4', speaker: null, text: "The hall erupts. Everyone's buzzing. Queenstown. This is going to be THE event of the year." },
      { id: 'w1d1-5', speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫', text: "\"The school covers transport and accommodation. But you'll need $45 spending money for activities and food during free time. That's YOUR responsibility.\"" },
      { id: 'w1d1-6', speaker: null, text: "Your stomach drops. $45. You get $15 a week. That's six weeks of pocket money... and you'd have to save almost HALF of everything to make it." },
      { id: 'w1d1-7', speaker: 'Jake', speakerEmoji: '😎', text: "\"Forty-five bucks? That's nothing. My parents will just give it to me.\"" },
      { id: 'w1d1-8', speaker: 'Mia', speakerEmoji: '🤓', text: "\"I've already got $20 saved from last month. I just need to save $25 more in six weeks. Totally doable.\"" },
      { id: 'w1d1-9', speaker: 'Liam', speakerEmoji: '😅', text: "\"Bro... I literally spent my last $5 yesterday. I'm cooked.\"" },
      { id: 'w1d1-10', speaker: null, text: "You look at the $15 in your pocket. Six weeks. $45 to save. The clock starts now." },
      { id: 'w1d1-11', speaker: null, text: "💡 Tip: You can save money in your piggy bank at home. Every dollar in there is a dollar closer to camp." },
    ],
  },

  // TUESDAY W1 - First Temptation
  {
    id: 'w1d2', week: 1, day: 2, freeRoam: true,
    scenes: [
      { id: 'w1d2-1', speaker: null, text: "Lunchtime. The tuck shop line is long. The smell of freshly baked pies fills the corridor." },
      { id: 'w1d2-2', speaker: 'Jake', speakerEmoji: '😎', text: "\"Yo, I'm getting a pie AND a juice. You in? The mince pie is insane today.\"",
        choices: [
          { label: "Get a pie and juice ($8.50)", walletChange: -8.50, piggyChange: 0, healthChange: -3, flag: 'bought_pie_w1',
            response: "The pie IS good. But as you eat it, you do the maths in your head. $15 minus $8.50 = $6.50 left. For the whole week. And you haven't saved anything for camp yet." },
          { label: "Just a cookie ($2)", walletChange: -2, piggyChange: 0, healthChange: 2,
            response: "Jake gives you a look. \"Just a cookie?\" You shrug. But $2 is a lot less than $8.50, and your camp fund isn't going to fill itself." },
          { label: "I brought lunch today", walletChange: 0, piggyChange: 0, healthChange: 5, flag: 'packed_lunch_w1',
            response: "\"Wow, packed lunch? What are you, five?\" Jake laughs. But as he walks away with his $8.50 pie, you think about Queenstown. That's $8.50 closer to kayaking." },
        ],
      },
    ],
  },

  // WEDNESDAY W1 - Mia's advice
  {
    id: 'w1d3', week: 1, day: 3, freeRoam: true,
    scenes: [
      { id: 'w1d3-1', speaker: null, text: "After school. You and Mia are walking to the bus stop." },
      { id: 'w1d3-2', speaker: 'Mia', speakerEmoji: '🤓', text: "\"So, are you actually going to try to save for camp? Because I've been thinking about it and the maths is tight.\"" },
      { id: 'w1d3-3', speaker: 'Mia', speakerEmoji: '🤓', text: "\"$45 in six weeks means saving about $7.50 per week. That leaves you $7.50 to actually spend. It's possible, but you can't be buying pies every day.\"" },
      { id: 'w1d3-4', speaker: 'Mia', speakerEmoji: '🤓', text: "\"My trick? I put the savings away FIRST. Monday morning, before I buy anything, I put $8 straight in my savings. What's left is what I spend. Simple.\"",
        choices: [
          { label: "\"That's actually smart. I'll try it.\"", walletChange: 0, piggyChange: 0, healthChange: 3, flag: 'mia_advice_taken',
            response: "Mia smiles. \"Trust me, it works. The hardest part is Monday — once the money's saved, you can't miss what you don't have.\"" },
          { label: "\"Sounds painful though...\"", walletChange: 0, piggyChange: 0, healthChange: 0,
            response: "\"It is! At first. But you know what's more painful? Being the one kid at camp with no money for the jet boat ride.\"" },
        ],
      },
    ],
  },

  // THURSDAY W1 - The Dairy Run
  {
    id: 'w1d4', week: 1, day: 4, freeRoam: true,
    scenes: [
      { id: 'w1d4-1', speaker: null, text: "Thursday after school. The whole group is heading to the dairy." },
      { id: 'w1d4-2', speaker: 'Jake', speakerEmoji: '😎', text: "\"Dairy run! I'm getting chips, a drink, AND a chocolate bar. The full combo. Let's go!\"" },
      { id: 'w1d4-3', speaker: 'Liam', speakerEmoji: '😅', text: "\"I'm broke already. Hey... can I borrow $3? I'll pay you back Monday, I swear.\"",
        choices: [
          { label: "Lend Liam $3", walletChange: -3, piggyChange: 0, healthChange: -2, flag: 'lent_liam_w1',
            response: "\"Legend! Monday, I promise.\" Liam takes the $3 and immediately buys chips and a drink. Deep down, you know that money's gone." },
          { label: "\"Sorry mate, saving for camp\"", walletChange: 0, piggyChange: 0, healthChange: 4, flag: 'denied_liam_w1',
            response: "Liam looks hurt for a second, then shrugs. \"Fair enough.\" He wanders off to ask someone else. It felt awkward — but your camp fund stays intact." },
          { label: "\"I can give you $1\"", walletChange: -1, piggyChange: 0, healthChange: 1,
            response: "\"Better than nothing I guess.\" Liam takes the dollar. You compromised — helped a friend without wrecking your budget." },
        ],
      },
    ],
  },

  // FRIDAY W1 - End of week reflection
  {
    id: 'w1d5', week: 1, day: 5, freeRoam: true,
    scenes: [
      { id: 'w1d5-1', speaker: null, text: "Friday. End of Week 1. You check your wallet and your piggy bank." },
      { id: 'w1d5-2', speaker: null, text: "Camp is in 5 weeks. How close are you to $45? The weekend stretches ahead — no spending temptations, but no income either." },
      { id: 'w1d5-3', speaker: null, text: "💡 Don't forget to save something in your piggy bank before the week ends — money in your pocket is money that can disappear." },
    ],
  },

  // ============ WEEK 2 ============

  // MONDAY W2 - The Plot Thickens
  {
    id: 'w2d1', week: 2, day: 1, freeRoam: true,
    scenes: [
      { id: 'w2d1-1', speaker: null, text: "Monday. Another $15 from Mum. Five weeks to camp." },
      { id: 'w2d1-2', speaker: null, text: "At school, there's a notice on the board..." },
      { id: 'w2d1-3', speaker: null, text: "📢 \"CAMP UPDATE: Activities confirmed — jet boating ($15), bungy viewing platform ($10), and the Queenstown night market. Budget accordingly!\"" },
      { id: 'w2d1-4', speaker: 'Jake', speakerEmoji: '😎', text: "\"Jet boating is a MUST. I'm doing everything. My parents already gave me $60 for camp.\"" },
      { id: 'w2d1-5', speaker: 'Mia', speakerEmoji: '🤓', text: "\"$15 for jet boating plus $10 for bungy viewing... that's $25 just on activities. You need to save more than I thought.\"" },
      { id: 'w2d1-6', speaker: null, text: "The stakes just got clearer. $45 gets you to camp with spending money. But to actually DO the fun stuff, every dollar counts." },
    ],
  },

  // TUESDAY W2 - Liam's debt
  {
    id: 'w2d2', week: 2, day: 2, freeRoam: true,
    scenes: [
      { id: 'w2d2-1', speaker: null, text: "Tuesday morning. You spot Liam at his locker.",
        condition: (s) => s.flags['lent_liam_w1'] === true },
      { id: 'w2d2-2', speaker: 'You', speakerEmoji: '🙂', text: "\"Hey Liam — that $3 from last week?\"",
        condition: (s) => s.flags['lent_liam_w1'] === true },
      { id: 'w2d2-3', speaker: 'Liam', speakerEmoji: '😅', text: "\"Oh yeah... about that... I had to buy lunch yesterday and I kind of... spent it. But NEXT Monday for sure!\"",
        condition: (s) => s.flags['lent_liam_w1'] === true,
        choices: [
          { label: "\"Not cool, Liam.\"", walletChange: 0, piggyChange: 0, healthChange: 2, flag: 'confronted_liam',
            response: "Liam looks uncomfortable. \"I know, I know. Next week, I swear on my life.\" You've heard that before. Lesson: lending to friends is easy. Getting it back? Not so much." },
          { label: "\"Just... remember, okay?\"", walletChange: 0, piggyChange: 0, healthChange: 0,
            response: "\"Definitely. 100%.\" He hurries off. You're $3 further from camp because of someone else's spending habits." },
        ],
      },
    ],
  },

  // WEDNESDAY W2 - The Opportunity
  {
    id: 'w2d3', week: 2, day: 3, freeRoam: true,
    scenes: [
      { id: 'w2d3-1', speaker: null, text: "Wednesday. A flyer on the school notice board catches your eye." },
      { id: 'w2d3-2', speaker: null, text: "📋 \"HELP NEEDED: Setting up for the school social this Friday. 2 hours after school. $10 pay. See Mr. Thompson.\"" },
      { id: 'w2d3-3', speaker: null, text: "Ten dollars for two hours of work. That would be a big boost to your camp fund. But Friday after school is when everyone hangs out at the dairy...",
        choices: [
          { label: "Sign up for the job ($10 on Friday)", walletChange: 0, piggyChange: 0, healthChange: 5, flag: 'took_setup_job',
            response: "You write your name on the sign-up sheet. $10 might not sound like much, but it's almost a week's worth of savings. Smart move — you're creating money, not just saving it." },
          { label: "Skip it — Friday hangs are sacred", walletChange: 0, piggyChange: 0, healthChange: -2,
            response: "You walk past the flyer. Friday with the crew is important. But a small voice in the back of your head does the maths: $10 is more than two days of pocket money..." },
        ],
      },
    ],
  },

  // THURSDAY W2 - Social pressure intensifies
  {
    id: 'w2d4', week: 2, day: 4, freeRoam: true,
    scenes: [
      { id: 'w2d4-1', speaker: null, text: "Thursday. Word's getting around about camp. Everyone's excited." },
      { id: 'w2d4-2', speaker: 'Jake', speakerEmoji: '😎', text: "\"We should go to the mall this weekend and buy stuff for camp. I'm getting new sunglasses and a portable speaker. You in?\"",
        choices: [
          { label: "\"Yeah, sounds fun!\"", walletChange: 0, piggyChange: 0, healthChange: -3, flag: 'agreed_mall_w2',
            response: "Jake fist-bumps you. \"Saturday, 11am.\" Your wallet is already nervous. The mall is a dangerous place when you're trying to save..." },
          { label: "\"I'll come hang but I'm not buying anything\"", walletChange: 0, piggyChange: 0, healthChange: 3, flag: 'mall_window_w2',
            response: "\"Window shopping? Lame. But fine.\" Jake shrugs. The trick will be actually sticking to that when you're surrounded by cool stuff." },
          { label: "\"Nah, I'm busy this weekend\"", walletChange: 0, piggyChange: 0, healthChange: 2,
            response: "\"Your loss.\" Jake walks off. You feel a pang of FOMO. But your piggy bank will feel better about it than you do." },
        ],
      },
    ],
  },

  // FRIDAY W2 - The Job or the Dairy
  {
    id: 'w2d5', week: 2, day: 5, freeRoam: true,
    scenes: [
      { id: 'w2d5-1', speaker: null, text: "Friday. End of Week 2. Four weeks to camp.",
        condition: (s) => s.flags['took_setup_job'] === true },
      { id: 'w2d5-2', speaker: null, text: "After school, you head to the hall to help set up for the social. It's two hours of moving chairs, hanging decorations, and testing the sound system.",
        condition: (s) => s.flags['took_setup_job'] === true },
      { id: 'w2d5-3', speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫', text: "\"Nice work. Here's your $10. You've earned it.\"",
        condition: (s) => s.flags['took_setup_job'] === true },
      { id: 'w2d5-4', speaker: null, text: "You pocket the $10. Two hours of work just gave you more than half a week's pocket money. This is what earning feels like.",
        condition: (s) => s.flags['took_setup_job'] === true },

      { id: 'w2d5-5', speaker: null, text: "Friday. End of Week 2. Four weeks to camp.",
        condition: (s) => !s.flags['took_setup_job'] },
      { id: 'w2d5-6', speaker: null, text: "At the dairy with the crew. Everyone's buying their usual. You hear from someone that the kids who helped set up the social got paid $10 each.",
        condition: (s) => !s.flags['took_setup_job'] },
      { id: 'w2d5-7', speaker: null, text: "You look at the chips in your hand. $2.50 spent. $10 missed. Opportunities have a price too.",
        condition: (s) => !s.flags['took_setup_job'] },
    ],
  },

  // ============ WEEK 3 ============

  // MONDAY W3 - The Plot Twist
  {
    id: 'w3d1', week: 3, day: 1, freeRoam: true,
    scenes: [
      { id: 'w3d1-1', speaker: null, text: "Monday. $15 from Mum. But at school, there's news..." },
      { id: 'w3d1-2', speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫', text: "\"Quick update on camp. Due to... pricing changes... the spending money requirement has gone up. It's now $50, not $45. Sorry, team.\"" },
      { id: 'w3d1-3', speaker: null, text: "The room groans. $50. Five more dollars doesn't sound like much — but when you're already scraping to save $45, an extra $5 feels huge." },
      { id: 'w3d1-4', speaker: 'Liam', speakerEmoji: '😅', text: "\"I literally have $2 saved. I might just not go.\"" },
      { id: 'w3d1-5', speaker: 'Mia', speakerEmoji: '🤓', text: "\"I'm at $30. The extra $5 is annoying but I can handle it. How are you tracking?\"",
        choices: [
          { label: "\"I'm behind but I'll make it\"", walletChange: 0, piggyChange: 0, healthChange: 2,
            response: "Mia nods. \"You've got three weeks. That's $16-17 a week if you haven't saved much. Tight, but not impossible. Cut the dairy runs.\"" },
          { label: "\"Honestly? I'm worried\"", walletChange: 0, piggyChange: 0, healthChange: 0,
            response: "\"Then let's make a plan. How much do you have saved right now?\" Mia pulls out a notebook. She's annoyingly organised, but right now that's exactly what you need." },
        ],
      },
    ],
  },

  // WEDNESDAY W3 - The Birthday Bomb
  {
    id: 'w3d3', week: 3, day: 3, freeRoam: true,
    scenes: [
      { id: 'w3d3-1', speaker: null, text: "Wednesday. A message in the group chat:" },
      { id: 'w3d3-2', speaker: null, text: "🎉 \"It's my birthday this Saturday! Party at mine, 2pm. Would love everyone there! — Sarah\"" },
      { id: 'w3d3-3', speaker: null, text: "Sarah's your close friend. You can't NOT get her a present. But a decent gift is $10-15. Money you were supposed to be saving for camp.",
        choices: [
          { label: "Buy a nice gift ($15)", walletChange: -15, piggyChange: 0, healthChange: -5, flag: 'expensive_gift',
            response: "You buy a nice candle and card set. Sarah will love it. But $15... that's an entire week's pocket money. Your camp fund just took a serious hit." },
          { label: "Get something smaller ($8)", walletChange: -8, piggyChange: 0, healthChange: 1, flag: 'medium_gift',
            response: "A nice chocolate box and a card. Thoughtful but not extravagant. Sarah won't know the difference — and you kept $7 for the week." },
          { label: "Make something homemade ($0)", walletChange: 0, piggyChange: 0, healthChange: 3, flag: 'homemade_gift',
            response: "You spend the evening making a card with inside jokes and photos. It'll actually mean more than something store-bought — and it cost you nothing. That's creative budgeting." },
        ],
      },
    ],
  },

  // FRIDAY W3
  {
    id: 'w3d5', week: 3, day: 5, freeRoam: true,
    scenes: [
      { id: 'w3d5-1', speaker: null, text: "Friday. Halfway point. Three weeks to camp, three weeks behind you." },
      { id: 'w3d5-2', speaker: null, text: "You open your piggy bank and count what's inside. The target is $50. How close are you?" },
      { id: 'w3d5-3', speaker: null, text: "⏰ You're at the halfway mark. If you have at least $25 saved, you're on track. If not — the next three weeks need to be different." },
    ],
  },

  // ============ WEEK 4 ============

  // MONDAY W4 - Second chance to earn
  {
    id: 'w4d1', week: 4, day: 1, freeRoam: true,
    scenes: [
      { id: 'w4d1-1', speaker: null, text: "Monday. $15 from Mum. Two weeks to camp. The excitement is building." },
      { id: 'w4d1-2', speaker: null, text: "Another notice on the board: 📋 \"Volunteers needed for Saturday market stall. $15 for 3 hours. Limited spots.\"" },
      { id: 'w4d1-3', speaker: null, text: "Fifteen dollars. That could be a game-changer for your camp fund.",
        choices: [
          { label: "Sign up immediately", walletChange: 0, piggyChange: 0, healthChange: 5, flag: 'took_market_job',
            response: "You grab the last spot. Saturday morning might be early, but $15 is $15. Your camp fund is about to get a serious boost." },
          { label: "Saturday morning? No thanks", walletChange: 0, piggyChange: 0, healthChange: -2,
            response: "You walk past it. Sleep > money? Maybe. But that's $15 someone else will earn instead of you." },
        ],
      },
    ],
  },

  // WEDNESDAY W4 - Liam's crisis
  {
    id: 'w4d3', week: 4, day: 3, freeRoam: true,
    scenes: [
      { id: 'w4d3-1', speaker: 'Liam', speakerEmoji: '😅', text: "\"I need to talk to you. I've got $8 saved for camp. That's it. I've been spending everything. I think... I might not be able to go.\"" },
      { id: 'w4d3-2', speaker: null, text: "Liam looks genuinely upset. This isn't his usual \"lend me $3\" routine. He actually might miss the biggest event of the year.",
        choices: [
          { label: "\"I'll help you make a budget for the last 2 weeks\"", walletChange: 0, piggyChange: 0, healthChange: 5, flag: 'helped_liam_budget',
            response: "You sit down with Liam and work out the numbers. $15 x 2 weeks = $30 incoming. He needs $42 more. \"If you save $12 a week and don't touch the dairy...\" Liam nods seriously. First time you've ever seen him take money seriously." },
          { label: "\"I can lend you $5 if it helps\"", walletChange: -5, piggyChange: 0, healthChange: 0, flag: 'lent_liam_camp',
            response: "\"Are you serious? I'll pay you back at camp, I PROMISE.\" You hand over $5. It's a risk — but this time feels different. He's not buying chips. He's trying to make camp happen." },
          { label: "\"You need to figure this out yourself\"", walletChange: 0, piggyChange: 0, healthChange: 2,
            response: "Liam nods slowly. \"Yeah... I know.\" It's harsh, but you've already lent him money before. At some point, people need to solve their own problems." },
        ],
      },
    ],
  },

  // ============ WEEK 5 ============

  // MONDAY W5 - Final push
  {
    id: 'w5d1', week: 5, day: 1, freeRoam: true,
    scenes: [
      { id: 'w5d1-1', speaker: null, text: "Monday. $15 from Mum. ONE WEEK to camp. This is it." },
      { id: 'w5d1-2', speaker: null, text: "Mr. Thompson puts up the final camp information sheet. Bus leaves next Monday at 7am. Kit list, room assignments, activity sign-ups." },
      { id: 'w5d1-3', speaker: 'Jake', speakerEmoji: '😎', text: "\"I've got $65 saved. Jet boating, bungy viewing, AND the night market. I'm doing EVERYTHING.\"" },
      { id: 'w5d1-4', speaker: 'Mia', speakerEmoji: '🤓', text: "\"I've got exactly $50. Tight, but I'm there. What about you? Did you make it?\"" },
      { id: 'w5d1-5', speaker: null, text: "You look at your piggy bank total. $50 is the target. Are you there? Close? Or is it going to be a stressful final week?" },
    ],
  },

  // WEDNESDAY W5 - The Temptation
  {
    id: 'w5d3', week: 5, day: 3, freeRoam: true,
    scenes: [
      { id: 'w5d3-1', speaker: 'Jake', speakerEmoji: '😎', text: "\"Last week before camp — we should celebrate! Pizza at the mall after school? My shout for the first round.\"" },
      { id: 'w5d3-2', speaker: null, text: "Jake's buying the first round, but you know how this goes. First round becomes second round, then someone suggests ice cream, then the arcade...",
        choices: [
          { label: "Go, but ONLY eat Jake's free pizza", walletChange: 0, piggyChange: 0, healthChange: 4, flag: 'free_pizza_only',
            response: "You go. You eat the free pizza. Jake buys ice cream — you say you're full. The arcade lights flash — you say you'll just watch. It takes willpower, but you walk out having spent $0. That might be the hardest thing you've done all term." },
          { label: "Go and enjoy yourself ($12)", walletChange: -12, piggyChange: 0, healthChange: -5, flag: 'splurged_w5',
            response: "Pizza, ice cream, arcade. It's a great afternoon. But as you walk home, you count what's left. Camp is in 5 days. Was today worth potentially missing the jet boat?" },
          { label: "\"Can't — saving every dollar for camp\"", walletChange: 0, piggyChange: 0, healthChange: 3,
            response: "\"Seriously? FINE.\" Jake looks annoyed. You go home instead. It's boring. But your camp fund is exactly where it needs to be." },
        ],
      },
    ],
  },

  // ============ WEEK 6 ============

  // MONDAY W6 - The Reckoning
  {
    id: 'w6d1', week: 6, day: 1, freeRoam: true,
    scenes: [
      { id: 'w6d1-1', speaker: null, text: "Final Monday. Last $15 from Mum. Camp is THIS FRIDAY." },
      { id: 'w6d1-2', speaker: null, text: "Mr. Thompson wants camp money collected by Thursday. $50 minimum to go on the trip." },
      { id: 'w6d1-3', speaker: null, text: "This is it. Check your piggy bank. Do you have enough? If not, you've got four days to close the gap." },
    ],
  },

  // WEDNESDAY W6 - Liam's resolution
  {
    id: 'w6d3', week: 6, day: 3, freeRoam: true,
    scenes: [
      { id: 'w6d3-1', speaker: 'Liam', speakerEmoji: '😅', text: "\"I did it. I actually did it. $52. I can't believe it.\"",
        condition: (s) => s.flags['helped_liam_budget'] === true },
      { id: 'w6d3-2', speaker: 'Liam', speakerEmoji: '😅', text: "\"I followed that budget you helped me make. Didn't go to the dairy ONCE for two weeks. Two weeks! I didn't know I could do that.\"",
        condition: (s) => s.flags['helped_liam_budget'] === true },
      { id: 'w6d3-3', speaker: null, text: "Liam looks different. Proud. You taught someone else what you were learning yourself.",
        condition: (s) => s.flags['helped_liam_budget'] === true },

      { id: 'w6d3-4', speaker: 'Liam', speakerEmoji: '😅', text: "\"I'm at $38. I'm not going to make it. My parents said they'd cover the last $12 but... I feel bad about it.\"",
        condition: (s) => !s.flags['helped_liam_budget'] },
      { id: 'w6d3-5', speaker: null, text: "Liam got close, but not close enough. His parents will bail him out — this time. But you can see he learned something.",
        condition: (s) => !s.flags['helped_liam_budget'] },
    ],
  },

  // THURSDAY W6 - Money Collection Day
  {
    id: 'w6d4', week: 6, day: 4, freeRoam: false,
    scenes: [
      { id: 'w6d4-1', speaker: null, text: "Thursday. Money collection day. Mr. Thompson is at his desk with an envelope for each student." },
      { id: 'w6d4-2', speaker: 'Mr. Thompson', speakerEmoji: '👨‍🏫', text: "\"Alright everyone, line up with your camp money. $50 minimum. If you've got it, you're on the bus Monday morning.\"" },
      { id: 'w6d4-3', speaker: null, text: "Your turn. You reach for your piggy bank..." },
    ],
  },

  // FRIDAY W6 - The Finale
  {
    id: 'w6d5', week: 6, day: 5, freeRoam: false,
    scenes: [
      { id: 'w6d5-1', speaker: null, text: "Friday. Last day before camp." },
    ],
  },
];

export function getStoryBeat(week: number, day: number): StoryBeat | undefined {
  return STORY_BEATS.find(b => b.week === week && b.day === day);
}

export function filterScenes(scenes: StoryScene[], storyState: StoryState): StoryScene[] {
  return scenes.filter(s => !s.condition || s.condition(storyState));
}

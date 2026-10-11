/**
 * MoniMate — "Did you know?" money cards, one at the end of every in-game day.
 *
 * Each life path gets cards pitched at its players' age and situation, and School cards unlock with
 * the level the player is on, so a 12-year-old meets "needs vs wants" before "compound interest" and
 * a working adult meets PAYE, ACC and mortgages. Facts are New Zealand–specific where it matters and
 * deliberately avoid numbers that change every year (KiwiSaver rates, repayment thresholds…) — the
 * card says where to check instead.
 */
import type { LifePath } from '../gameData';

export type FactKind = 'did_you_know' | 'money_word' | 'real_life' | 'important';

export interface MoneyFact {
  id: string;
  path: LifePath;
  /** First level this card can appear on (School and University have levels). */
  minLevel?: number;
  kind: FactKind;
  title: string;
  body: string;
  /** A worked example or "try this", shown in a box. */
  example?: string;
}

export const FACT_KIND_LABEL: Record<FactKind, { label: string; icon: string; color: string }> = {
  did_you_know: { label: 'DID YOU KNOW?', icon: '💡', color: '#ffd23f' },
  money_word: { label: 'MONEY WORD', icon: '📖', color: '#79c0ff' },
  real_life: { label: 'REAL-LIFE TIP', icon: '🧭', color: '#3fb950' },
  important: { label: 'IMPORTANT', icon: '⚠️', color: '#ff7b72' },
};

export const MONEY_FACTS: MoneyFact[] = [
  // ── School (ages ~11–15) ───────────────────────────────────────────────────────────────────
  { id: 's_needs_wants', path: 'school', kind: 'money_word', title: 'Needs vs wants',
    body: 'A need is something you must have (food, a way to get to school). A want is nice to have (snacks, game skins). Budgeting is mostly deciding which wants fit after your needs.',
    example: 'Lunch = need. A second bubble tea = want.' },
  { id: 's_budget', path: 'school', kind: 'money_word', title: 'Budget',
    body: 'A budget is a plan for your money before you spend it: how much for food, transport, fun and saving. Planning first means fewer "where did it all go?" moments.',
    example: '$20 a week → $10 food, $4 bus, $3 fun, $3 saving.' },
  { id: 's_opportunity', path: 'school', kind: 'money_word', title: 'Opportunity cost',
    body: 'Every time you buy something, you give up the next best thing you could have had with that money. That "thing you gave up" is the opportunity cost.',
    example: '$8 at the arcade = the fair ticket you can no longer afford.' },
  { id: 's_small_adds', path: 'school', kind: 'did_you_know', title: 'Small spends add up',
    body: 'A $3 snack every school day is $15 a week, about $60 a month and over $500 across a school year.',
    example: '$3 × 5 days × 38 school weeks = $570.' },
  { id: 's_pay_yourself', path: 'school', kind: 'real_life', title: 'Pay yourself first',
    body: 'Put a little into savings the moment you get money, before you spend any. People who save first save far more than people who save "whatever is left".' },
  { id: 's_unit_price', path: 'school', kind: 'did_you_know', title: 'Unit pricing',
    body: 'Big New Zealand supermarkets must show a unit price (like $ per kg or per litre) on the shelf label, so you can compare brands and pack sizes fairly.',
    example: 'A big pack is not always cheaper — check the price per kg.' },
  { id: 's_sales', path: 'school', kind: 'real_life', title: 'A sale is only a deal if you needed it',
    body: '"40% off!" still means spending 60%. Shops use countdown timers and "only 2 left" to make you rush. Wait a day — if you still want it, it was probably a real want.' },
  { id: 's_bank_account', path: 'school', minLevel: 2, kind: 'did_you_know', title: 'Kids can have bank accounts',
    body: 'Most NZ banks offer free accounts for children and teens, usually opened with a parent. Money in the bank is safer than a piggy bank and can earn interest.' },
  { id: 's_interest', path: 'school', minLevel: 2, kind: 'money_word', title: 'Interest',
    body: 'Interest is money the bank pays you for keeping your savings with them. It is a percentage of your balance, usually paid monthly or yearly.',
    example: '$100 at 4% a year earns about $4 in a year.' },
  { id: 's_compound', path: 'school', minLevel: 2, kind: 'money_word', title: 'Compound interest',
    body: 'When interest earns interest. Your savings grow a little faster every year because last year’s interest starts earning too. Starting early matters more than starting big.' },
  { id: 's_delayed', path: 'school', minLevel: 2, kind: 'real_life', title: 'Waiting is a superpower',
    body: 'Saving up for something instead of buying the cheaper thing now is called delayed gratification. It is one of the best predictors of being good with money.' },
  { id: 's_scams', path: 'school', minLevel: 2, kind: 'important', title: 'Spot a scam',
    body: 'Prizes you didn’t enter, "pay a small fee to claim $500", or messages rushing you are scams. Banks never ask for your password or PIN by text or email. When unsure, ask an adult.' },
  { id: 's_debt', path: 'school', minLevel: 3, kind: 'money_word', title: 'Debt',
    body: 'Debt is money you owe. A tab at the tuck shop, borrowing from a friend or a phone plan you pay off are all debts. Debt is a promise to use future money on the past.' },
  { id: 's_bnpl', path: 'school', minLevel: 3, kind: 'important', title: 'Buy now, pay later',
    body: 'Buy-now-pay-later splits a price into chunks, but missed payments bring late fees, and having several on the go makes it easy to lose track of what you owe.' },
  { id: 's_subscriptions', path: 'school', minLevel: 3, kind: 'did_you_know', title: 'Free trials become subscriptions',
    body: 'Most "free trials" start charging automatically. Put a reminder in your calendar the day before it ends — cancelling is free, forgetting is not.' },
  { id: 's_gst', path: 'school', minLevel: 4, kind: 'money_word', title: 'GST',
    body: 'Goods and Services Tax is 15% in New Zealand and is already included in most shop prices. It helps pay for schools, hospitals and roads.',
    example: 'A $11.50 item includes $1.50 of GST.' },
  { id: 's_ird', path: 'school', minLevel: 4, kind: 'important', title: 'Your IRD number',
    body: 'You need an IRD (Inland Revenue) number to get paid properly for a job. Without one, your employer must tax you at the "no declaration" rate of 45%.' },
  { id: 's_tax_code', path: 'school', minLevel: 4, kind: 'money_word', title: 'Tax code',
    body: 'When you start a job you fill in a tax code form. "M" is for your main job. The right code means the right amount of tax comes out of each pay.' },
  { id: 's_payslip', path: 'school', minLevel: 4, kind: 'real_life', title: 'Read your payslip',
    body: 'A payslip shows your hours, your pay rate, the tax taken out (PAYE) and what actually lands in your account. Check it — mistakes happen.' },
  { id: 's_kiwisaver', path: 'school', minLevel: 5, kind: 'money_word', title: 'KiwiSaver',
    body: 'KiwiSaver is New Zealand’s long-term savings scheme. When you work, part of your pay goes in, your employer adds some, and the government can add a yearly contribution too. Check kiwisaver.govt.nz for current rates.' },
  { id: 's_goal', path: 'school', minLevel: 5, kind: 'real_life', title: 'SMART savings goals',
    body: 'Goals work better when they are Specific, Measurable, Achievable, Relevant and Time-bound: "$120 for a phone by July" beats "save more".' },
  { id: 's_rule72', path: 'school', minLevel: 6, kind: 'did_you_know', title: 'The rule of 72',
    body: 'Divide 72 by an interest rate to estimate how many years it takes money to double.',
    example: 'At 6% a year: 72 ÷ 6 = about 12 years to double.' },
  { id: 's_shares', path: 'school', minLevel: 6, kind: 'money_word', title: 'Shares and index funds',
    body: 'A share is a tiny piece of a company. An index fund owns small pieces of lots of companies at once, so one company doing badly hurts less. That spreading is called diversification.' },
  { id: 's_insurance', path: 'school', minLevel: 6, kind: 'money_word', title: 'Insurance',
    body: 'Insurance is paying a small, regular amount (a premium) so that if something expensive goes wrong — a broken phone, a crash — you are not stuck with the whole bill.' },

  // ── University (ages ~18–22) ──────────────────────────────────────────────────────────────
  { id: 'u_studylink', path: 'university', kind: 'did_you_know', title: 'StudyLink',
    body: 'StudyLink handles student loans and student allowances in New Zealand. Living costs from a student loan are borrowed money — you pay them back later.' },
  { id: 'u_loan_interest', path: 'university', kind: 'did_you_know', title: 'NZ student loans are interest-free… here',
    body: 'Student loans have no interest while you live in New Zealand. Move overseas for more than six months and interest starts being charged.' },
  { id: 'u_loan_repay', path: 'university', kind: 'money_word', title: 'Loan repayments',
    body: 'Once you earn over a set threshold, 12 cents of every dollar above it goes to your student loan automatically through your pay. Check ird.govt.nz for this year’s threshold.' },
  { id: 'u_bond', path: 'university', kind: 'important', title: 'Rental bonds',
    body: 'A landlord can ask for up to four weeks’ rent as bond, and must lodge it with Tenancy Services. Take dated photos when you move in — they are your proof when you move out.' },
  { id: 'u_rent_advance', path: 'university', kind: 'did_you_know', title: 'Rent in advance',
    body: 'In NZ a landlord can’t ask for more than two weeks’ rent in advance. Letting fees charged to tenants are banned too.' },
  { id: 'u_50_30_20', path: 'university', kind: 'real_life', title: 'The 50/30/20 budget',
    body: 'A simple starting point: about 50% of income on needs (rent, food, transport), 30% on wants, 20% on savings or paying off debt. Adjust it to your life — but write it down.' },
  { id: 'u_emergency', path: 'university', kind: 'real_life', title: 'An emergency fund',
    body: 'Aim to keep a buffer for surprises — a broken laptop, a doctor’s visit, a late pay. Even $300 means a bad week doesn’t turn into a credit card balance.' },
  { id: 'u_credit_card', path: 'university', minLevel: 2, kind: 'important', title: 'Credit card interest',
    body: 'Credit card interest is often around 20% a year. Pay the full balance every month and it costs nothing; pay only the minimum and a $500 purchase can take years to clear.' },
  { id: 'u_credit_score', path: 'university', minLevel: 2, kind: 'money_word', title: 'Credit score',
    body: 'A credit score (in NZ usually 0–1000) sums up how reliably you repay. Paying bills on time builds it; missed payments lower it and can make loans more expensive later.' },
  { id: 'u_tax_return', path: 'university', minLevel: 3, kind: 'did_you_know', title: 'You might be owed a refund',
    body: 'If you had the wrong tax code or several jobs, Inland Revenue may owe you money. Check your myIR account after the tax year ends on 31 March.' },
  { id: 'u_kiwisaver_match', path: 'university', minLevel: 3, kind: 'real_life', title: 'Free money: the employer contribution',
    body: 'When you contribute to KiwiSaver from your pay, your employer must contribute too. Opting out means giving up that extra money.' },
  { id: 'u_fees', path: 'university', minLevel: 3, kind: 'did_you_know', title: 'Bank fees add up',
    body: 'Many banks have free accounts for tertiary students. A $5 monthly account fee is $60 a year for nothing.' },
  { id: 'u_index', path: 'university', minLevel: 4, kind: 'money_word', title: 'Diversification',
    body: 'Don’t put all your eggs in one basket: owning lots of different investments (like an index fund) means one bad company or sector can’t sink you.' },
  { id: 'u_phishing', path: 'university', minLevel: 4, kind: 'important', title: 'Phishing',
    body: 'Fake emails and texts copy your bank, IRD or a courier to steal logins. Never click the link — go to the real website or app yourself. Report scams to Netsafe.' },
  { id: 'u_negotiate', path: 'university', minLevel: 5, kind: 'real_life', title: 'Negotiate your first salary',
    body: 'Research what the role usually pays before an offer arrives. A polite, evidence-based counter-offer is normal — and every future raise builds on your starting pay.' },
  { id: 'u_net_pay', path: 'university', minLevel: 5, kind: 'money_word', title: 'Gross vs net pay',
    body: 'Gross pay is before deductions; net pay is what lands in your account after PAYE tax, ACC levy, KiwiSaver and student loan repayments. Budget with net.' },

  // ── International student ─────────────────────────────────────────────────────────────────
  { id: 'i_visa_hours', path: 'international', kind: 'important', title: 'Your visa sets your work hours',
    body: 'Student visas limit how many hours you can work during study terms. Working more than your visa allows can risk your visa — check your conditions on Immigration New Zealand’s website.' },
  { id: 'i_ird', path: 'international', kind: 'important', title: 'Get an IRD number before you start work',
    body: 'Without an IRD number your employer must use the 45% "no declaration" tax rate. Apply online early — it can take a little while to arrive.' },
  { id: 'i_exchange', path: 'international', kind: 'money_word', title: 'Exchange rates and transfer fees',
    body: 'Money sent from home is converted at an exchange rate, and banks often add a margin plus a fee. Compare the total NZ dollars you actually receive, not just the advertised fee.' },
  { id: 'i_insurance', path: 'international', kind: 'did_you_know', title: 'ACC covers accidents for everyone in NZ',
    body: 'New Zealand’s ACC helps with the cost of accidental injuries for everyone in the country — but international students still need their own medical and travel insurance for illness.' },
  { id: 'i_tenancy', path: 'international', kind: 'real_life', title: 'Know your tenancy rights',
    body: 'Bonds must be lodged with Tenancy Services and are capped at four weeks’ rent. Get a written tenancy agreement and a receipt for everything you pay.' },
  { id: 'i_cost', path: 'international', kind: 'real_life', title: 'Track the first month closely',
    body: 'Setting-up costs (bond, SIM, kitchen basics, transport card) make month one the most expensive. Track every dollar so you know your real weekly cost of living.' },
  { id: 'i_bank_safe', path: 'international', kind: 'did_you_know', title: 'Your bank deposits are protected',
    body: 'New Zealand’s Depositor Compensation Scheme protects up to $100,000 per person at each licensed bank, if a bank were ever to fail.' },
  { id: 'i_scam', path: 'international', kind: 'important', title: 'Scams targeting students',
    body: 'Fake calls claiming to be immigration or police and demanding payment are common. Government agencies never ask you to pay in gift cards or crypto. Hang up and call the official number.' },

  // ── Working life ──────────────────────────────────────────────────────────────────────────
  { id: 'w_paye', path: 'working', kind: 'money_word', title: 'PAYE',
    body: 'Pay As You Earn: your employer takes income tax out of every pay and sends it to Inland Revenue, so most employees never need to file a tax return.' },
  { id: 'w_acc_levy', path: 'working', kind: 'did_you_know', title: 'The ACC earner levy',
    body: 'Part of your payslip deductions is the ACC earner levy. It funds cover for injuries you get outside work, like playing sport.' },
  { id: 'w_kiwisaver_rate', path: 'working', kind: 'real_life', title: 'Choose your KiwiSaver rate and fund',
    body: 'You can choose how much of your pay goes to KiwiSaver and what kind of fund it sits in (conservative to growth). Long-term savers usually look at growth funds — check fees too.' },
  { id: 'w_emergency', path: 'working', kind: 'real_life', title: 'Three months of expenses',
    body: 'A common rule of thumb is an emergency fund covering about three months of essential costs. It turns a job loss or car repair from a crisis into an inconvenience.' },
  { id: 'w_car_loan', path: 'working', kind: 'important', title: 'The true cost of a car loan',
    body: 'Look past the weekly payment: add up every payment over the loan, plus insurance, fuel, WoF and repairs. A cheap car bought outright often beats a nicer one on finance.' },
  { id: 'w_inflation', path: 'working', kind: 'money_word', title: 'Inflation',
    body: 'Inflation is prices rising over time, so the same dollar buys less. Savings earning less than inflation are slowly losing value.' },
  { id: 'w_mortgage', path: 'working', kind: 'money_word', title: 'Mortgage and deposit',
    body: 'A mortgage is a loan to buy a home. Banks usually want a deposit — often around 20% of the price — and first-home buyers may be able to use KiwiSaver savings towards it.' },
  { id: 'w_lifestyle', path: 'working', kind: 'did_you_know', title: 'Lifestyle creep',
    body: 'When income rises, spending quietly rises with it. Deciding in advance to save part of every pay rise is one of the easiest ways to build wealth.' },
];

/** Cards for this path that are unlocked at this level, in the order they should be met. */
export function factsFor(path: LifePath, level: number): MoneyFact[] {
  return MONEY_FACTS.filter(f => f.path === path && (f.minLevel ?? 1) <= level);
}

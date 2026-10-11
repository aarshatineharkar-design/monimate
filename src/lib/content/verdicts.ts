/**
 * MoniMate — how each decision reads, money-wise. Shown on the decision card right after you choose,
 * and collected into the end-of-day "Lessons learned" recap.
 *
 *   good     — a smart money move (saved, earned, planned ahead, avoided a trap)
 *   bad      — it cost you more than it needed to, or set up a problem later
 *   tradeoff — fair either way: you paid for something real (fun, a friend, comfort, time)
 *
 * Keyed `missionId:choiceId` (life events: `life:eventId:choiceId`). Choices that aren't really
 * money decisions — reading a message, picking the week's goal, "OK" — are left out on purpose
 * and stay neutral. `verdicts.test.ts` checks every key still points at a real choice.
 */
export type Verdict = 'good' | 'bad' | 'tradeoff';

const G = 'good', B = 'bad', T = 'tradeoff';

export const CHOICE_VERDICTS: Record<string, Verdict> = {
  // ── School Level 1 ──
  'lunch_break:meal': T, 'lunch_break:snack': T, 'lunch_break:packed': G, 'lunch_break:skip': B,
  'after_school_snack:noodles': T, 'after_school_snack:decline': G, 'after_school_snack:home': G,
  'homework:study': G, 'homework:free': T,
  'friend_birthday:full': T, 'friend_birthday:partial': G, 'friend_birthday:decline': T,
  'arcade_invite:arcade': T, 'arcade_invite:spend_less': G, 'arcade_invite:park': G, 'arcade_invite:home': T,
  'unexpected_event:pay': T, 'unexpected_event:walk': G,
  'dairy_shift:work': G,
  'unexpected_shoe:pay': T, 'unexpected_shoe:walk': G,
  'sports_signup:join': T, 'sports_signup:pass': T,
  'project_day:present': G, 'project_day:rush': B, 'project_day:borrow': B,
  'team_game:pizza': T, 'team_game:play': G,
  'mum_pancakes:stay': G,
  'lunch_money:take': T, 'lunch_money:make': G,
  'bus_pass_offer:buy': T,
  'phone_data:topup': T, 'phone_data:wifi': G,
  'jordan_loan:lend': T,
  'hot_choc_riley:yes': T, 'hot_choc_riley:no': G,
  'forgot_pe_kit:buy': B, 'forgot_pe_kit:borrow': G,
  'rainy_morning:umbrella': T, 'rainy_morning:hood': T,
  'dog_walk:walk': G,
  'library_fine:pay': B, 'library_fine:done': G,
  'game_sale:pay': T, 'game_sale:no': G,
  'cafe_study:choc': T, 'cafe_study:water': G,
  'found_wallet:hand_in': G, 'found_wallet:keep': B, 'found_wallet:thanks': G,
  'car_wash:donate': T, 'car_wash:wash': G,
  'tutoring:teach': G,
  'can_recycling:collect': G,
  'bake_sale:buy': B, 'bake_sale:ingredients': G,
  'charity_run:three': T, 'charity_run:one': T, 'charity_run:cheer': G,
  'bubble_tea:large': B, 'bubble_tea:small': T, 'bubble_tea:hang': G,
  'online_sale:post': G,
  'streaming_trial:keep': B, 'streaming_trial:cancel': G,
  'sneaker_sale:buy': B, 'sneaker_sale:close': G,
  'grandma_call:chat': G,
  'group_gift:chip': T, 'group_gift:sign': G,
  'phone_scam:pay': B, 'phone_scam:block': G,
  'game_skin:buy': B, 'game_skin:skip': G,
  'bills_with_mum:sit': G,
  'movie_night:cinema': T, 'movie_night:home': G,
  'savings_match:save': G, 'savings_match:no': B,
  'late_snack:order': B, 'late_snack:toast': G,
  'lawn_mowing:mow': G,
  'market_stall:sell': G,
  'babysit:yes': G,
  'vintage_jacket:buy': G,
  'family_brunch:yes': G,

  // ── School Level 2 ──
  'l2_bank_account:piggy': B, 'l2_bank_account:open': G,
  'l2_patience:now': B, 'l2_patience:wait': G,
  'l2_school_bag:mall': B, 'l2_school_bag:market': G, 'l2_school_bag:fix': G,
  'l2_chore_contract:deal': G,
  'l2_dishes:do': G, 'l2_dishes:skip': B,
  'l2_lost_cash:retrace': G, 'l2_lost_cash:let_go': B,
  'l2_interest_lesson:a': B, 'l2_interest_lesson:b': G, 'l2_interest_lesson:c': B,
  'l2_mystery_boxes:invest': B, 'l2_mystery_boxes:no': G,
  'l2_patience_payout:take': G,
  'l2_bike_sale:buy': G,
  'l2_market_bag:buy': G,
  'l2_gift_shopping:flowers': T, 'l2_gift_shopping:candle': B, 'l2_gift_shopping:homemade': G,
  'l2_mum_birthday:give': G, 'l2_mum_birthday:breakfast': G,
  'l2p_vending:buy': B, 'l2p_vending:water': G,
  'l2p_trading_cards:buy': B, 'l2p_trading_cards:no': G,
  'l2p_book_fair:buy': T, 'l2p_book_fair:library': G,
  'l2p_grandad_money:save': G, 'l2p_grandad_money:spend': T,
  'l2p_coin_jar:save': G, 'l2p_coin_jar:spend': T,
  'l2p_car_wash:wash': G,
  'l2p_uniform:secondhand': G, 'l2p_uniform:new': B,

  // ── School Level 3 ──
  'l3_budget_plan:balanced': G, 'l3_budget_plan:saver': G, 'l3_budget_plan:social': T, 'l3_budget_plan:none': B,
  'l3_phone_topup:topup': T, 'l3_phone_topup:wifi': T,
  'l3_meal_prep:go': G, 'l3_meal_prep:skip': B,
  'l3_free_trial:trial': B, 'l3_free_trial:no': G,
  'l3_fare_rise:buy': G, 'l3_fare_rise:no': T,
  'l3_tuck_tab:tab': B, 'l3_tuck_tab:cash': G,
  'l3_split_bill:even': T, 'l3_split_bill:fair': G, 'l3_split_bill:cover': T,
  'l3_museum_trip:keyring': T, 'l3_museum_trip:postcard': T, 'l3_museum_trip:nothing': G,
  'l3_tab_due:pay': G, 'l3_tab_due:later': B,
  'l3_budget_checkin:shift': G,
  'l3_trial_reminder:cancel': G, 'l3_trial_reminder:keep': B,
  'l3_party_gift:group': G, 'l3_party_gift:own': T, 'l3_party_gift:card': G,
  'l3_jordan_party:party': G,
  'l3_market_job:work': G,
  'l3p_snack:buy': T, 'l3p_snack:no': G,
  'l3p_bogof:buy': B, 'l3p_bogof:no': G,
  'l3p_group_order:in': B, 'l3p_group_order:out': G,
  'l3p_cousin_phone:weekly': B, 'l3p_cousin_phone:no': G,
  'l3p_breakfast:yes': T, 'l3p_breakfast:cereal': G,
  'l3p_mufti:donate': T,
  'l3p_haircut:barber': T, 'l3p_haircut:student': G, 'l3p_haircut:mum': G,

  // ── School Level 4 ──
  'l4_job_starts:code_m': G, 'l4_job_starts:code_me': B, 'l4_job_starts:ask': G,
  'l4_ird_letter:fix': G, 'l4_ird_letter:ignore': B,
  'l4_extra_shift:yes': G, 'l4_extra_shift:no': T,
  'l4_extra_shift_work:work': G,
  'l4_payday:save_half': G, 'l4_payday:spend': B, 'l4_payday:save_all': G,
  'l4p_overtime:yes': G,
  'l4p_budget_app:yes': G,
  'l4p_flat_white:go': T, 'l4p_flat_white:skip': G,
  'l4p_ird_myir:set_up': G,

  // ── School Level 5 ──
  'l5_kiwisaver:sign_up': G, 'l5_kiwisaver:later': T,
  'l5_temptation:buy': B, 'l5_temptation:wait': G, 'l5_temptation:sell': B,
  'l5_auto_save:set_up': G, 'l5_auto_save:manual': T,
  'l5_goal_day:yes': G, 'l5_goal_day:nearly': T, 'l5_goal_day:no': B,
  'l5p_price_compare:agree': G,
  'l5p_second_job:yes': G,

  // ── School Level 6 ──
  'l6p_scam_email:delete': G, 'l6p_scam_email:click': B, 'l6p_scam_email:report': G,
  'l6p_emergency_fund:set_buffer': G, 'l6p_emergency_fund:skip': B,

  // ── University Level 1 ──
  'uni_coffee:yes': T, 'uni_coffee:instant': G,
  'uni_breakfast:yes': G,
  'uni_notes:buy': B, 'uni_notes:no': G,
  'uni_snooze:snooze': T,
  'uni_free_food:go': G,
  'uni_research_study:do': G,
  'uni_study_group:study': G,
  'uni_gym_trial:gym': T, 'uni_gym_trial:run': G,
  'uni_bulk_buy:yes': G,
  'uni_market_research:dairy': T, 'uni_market_research:walk': G, 'uni_market_research:black': G,
  'uni_flat_dinner:cook': G, 'uni_flat_dinner:pizza': B, 'uni_flat_dinner:skip': B,
  'uni_bnpl:buy': B, 'uni_bnpl:no': G,
  'uni_credit_card:apply': B, 'uni_credit_card:no': G,
  'uni_mum_call:accept': T, 'uni_mum_call:fine': G,
  'uni_gig:buy': B, 'uni_gig:no': G,
  'uni_party:snacks': T, 'uni_party:pizza': G, 'uni_party:stay': T,
  'uni_farmers_market:buy': G,
  'uni_op_shop:op': G, 'uni_op_shop:new': B, 'uni_op_shop:layer': G,
  'uni_weekend_shift:work': G,
  'uni_hike:go': G,
  'uni_rent:pay': G, 'uni_rent:half': T, 'uni_rent:later': B,
  'uni_textbook:used': G, 'uni_textbook:library': G, 'uni_textbook:new': T,
  'uni_big_shop:go': G, 'uni_big_shop:skip': B,
  'uni_clubs_day:tramping': T, 'uni_clubs_day:boardgames': G, 'uni_clubs_day:pizza': G,
  'uni_job_hunt:apply': G, 'uni_job_hunt:skip': T,
  'uni_interview:honest': G, 'uni_interview:bluff': B,
  'uni_power_bill:pay': G, 'uni_power_bill:sky': B, 'uni_power_bill:later': B,
  'uni_charger:official': B, 'uni_charger:generic': G, 'uni_charger:library': G,
  'uni_trial_shift:work': G, 'uni_trial_shift:msl': G, 'uni_trial_shift:m': B, 'uni_trial_shift:nd': B,
  'uni_rent_rest:pay100': G, 'uni_rent_rest:pay200': G, 'uni_rent_rest:stall': B,
  'uni_quiz:do': G, 'uni_quiz:cram': T, 'uni_quiz:skip': B,
  'uni_raglan:go': T, 'uni_raglan:cheap': G, 'uni_raglan:stay': T,

  // ── University Level 2 ──
  'l2_rent:pay': G, 'l2_rent:later': B,
  'l2_flatmate_drama:confront': G, 'l2_flatmate_drama:rules': G, 'l2_flatmate_drama:ignore': B,
  'l2_ird_number:apply': G, 'l2_ird_number:later': B,
  'l2_budget_plan:tight': G, 'l2_budget_plan:balanced': G, 'l2_budget_plan:yolo': B,
  'l2_shared_groceries:in': G, 'l2_shared_groceries:own': T,
  'l2_second_lecture:add': T, 'l2_second_lecture:stay': T,
  'l2_cafe_first_shift:work': G,
  'l2_cheap_eats:go': G,
  'l2_overdue_library:pay': G, 'l2_overdue_library:ignore': B,

  // ── University Level 3 ──
  'l3_tax_return:file': G, 'l3_tax_return:later': B,
  'l3_kiwisaver:three': G, 'l3_kiwisaver:four': G, 'l3_kiwisaver:opt_out': B,
  'l3_laptop_insurance:insure': G, 'l3_laptop_insurance:skip': T,
  'l3_bond_dispute:challenge': G, 'l3_bond_dispute:accept': B,
  'l3_power_switch:switch': G, 'l3_power_switch:stay': B,
  'l3_student_loan_check:check': G, 'l3_student_loan_check:avoid': B,
  'l3_bank_fee:switch': G, 'l3_bank_fee:ignore': B,
  'l3_phone_plan:switch': G, 'l3_phone_plan:stay': B,

  // ── University Level 4 ──
  'l4_credit_card:decline': G, 'l4_credit_card:accept_careful': T, 'l4_credit_card:accept_yolo': B,
  'l4_sharesies:invest': G, 'l4_sharesies:research': T, 'l4_sharesies:skip': T,
  'l4_graduation_costs:automate': G, 'l4_graduation_costs:manual': T, 'l4_graduation_costs:ignore': B,
  'l4_loan_plan:extra': G, 'l4_loan_plan:minimum': T, 'l4_loan_plan:ignore': B,
  'l4_exam_prep:free': G, 'l4_exam_prep:print': T,
  'l4_flat_farewell:split': T, 'l4_flat_farewell:organise': G, 'l4_flat_farewell:skip': T,
  'l4_subscription_audit:cancel': G, 'l4_subscription_audit:keep': B,
  'l4_scam_email:report': G, 'l4_scam_email:click': B,

  // ── University Level 5 ──
  'l5_loan_repayment:extra': G, 'l5_loan_repayment:minimum': T, 'l5_loan_repayment:check': G,
  'l5_job_offer_negotiation:negotiate': G, 'l5_job_offer_negotiation:accept': B, 'l5_job_offer_negotiation:ask_time': G,
  'l5_kiwisaver_employer:three': G, 'l5_kiwisaver_employer:four': G, 'l5_kiwisaver_employer:eight': G,
  'l5_flat_move:home': G, 'l5_flat_move:new_flat': T, 'l5_flat_move:stay': T,
  'l5_car_decision:bus': G, 'l5_car_decision:carpool': G, 'l5_car_decision:car_loan': B,
  'l5_monthly_budget:strict': T, 'l5_monthly_budget:balanced': G, 'l5_monthly_budget:loose': B,
  'l5_house_deposit:plan': G, 'l5_house_deposit:later': T,
  'l5_work_lunch:join': T, 'l5_work_lunch:bring': T, 'l5_work_lunch:rotate': G,
  'l5_insurance_review:get': G, 'l5_insurance_review:later': B,

  // ── International ──
  'intl_rent:pay_full': G, 'intl_rent:pay_rent': T, 'intl_rent:ask': G,
  'intl_sim:nz_sim': G, 'intl_sim:roam': B, 'intl_sim:free_wifi': T,
  'intl_bank:open': G, 'intl_bank:later': B,
  'intl_orientation:attend': G, 'intl_orientation:half': T, 'intl_orientation:skip': B,
  'intl_grocery_shock:smart_shop': G, 'intl_grocery_shock:comfort_food': T, 'intl_grocery_shock:takeaways': B,
  'intl_lunch_wed:campus': T, 'intl_lunch_wed:packed': G, 'intl_lunch_wed:skip': B,
  'intl_cooking_lesson:join': G, 'intl_cooking_lesson:takeaways_2': B, 'intl_cooking_lesson:nothing': B,
  'intl_work_visa:apply_20': G, 'intl_work_visa:apply_40': B, 'intl_work_visa:check_first': G,
  'intl_ird:apply': G, 'intl_ird:later': B,
  'intl_friday_recap:track': G, 'intl_friday_recap:rough': T, 'intl_friday_recap:no_track': B,
  'intl_video_call:honest': G, 'intl_video_call:optimistic': T, 'intl_video_call:skip_call': B,

  // ── Working ──
  'work_fixed_bills:pay_both': G, 'work_fixed_bills:delay_loan': B, 'work_fixed_bills:transfer': G,
  'work_budget_map:write_budget': G, 'work_budget_map:mental_note': B, 'work_budget_map:app': G,
  'work_lunch_tue:buy': B, 'work_lunch_tue:packed': G, 'work_lunch_tue:skip': B,
  'work_wof:book_now': G, 'work_wof:drive_risk': B, 'work_wof:ask_advance': T,
  'work_emergency_fund:start': G, 'work_emergency_fund:soon': T, 'work_emergency_fund:later': B,
  'work_kiwisaver:understand': G, 'work_kiwisaver:increase': G, 'work_kiwisaver:no_touch': T,
  'work_student_loan:understand': G, 'work_student_loan:extra': G, 'work_student_loan:ignore': T,
  'work_friday_recap:saved': G, 'work_friday_recap:broke_even': T, 'work_friday_recap:overspent': B,
  'work_gross_net:explain': G, 'work_gross_net:gross': B, 'work_gross_net:net': G,

  // ── Activities started from the HUD ──
  'activity:help_mum': G, 'activity:decline_mum': T,

  // ── Small life events ──
  'life:found_coins:keep': G, 'life:found_coins:leave': T,
  'life:jordan_borrow:lend': T, 'life:jordan_borrow:decline': T,
  'life:helped_neighbour:help': G,
  'life:bike_tire:fix': G, 'life:bike_tire:wait': B,
  'life:flash_sale:browse': G, 'life:flash_sale:impulse': B,
};

export function verdictFor(key: string): Verdict | undefined {
  return CHOICE_VERDICTS[key];
}

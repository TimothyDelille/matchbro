import type { User } from "@supabase/supabase-js";
import type { Scores } from "@/lib/score";

/**
 * Demo mode: these accounts upload for real but skip Stripe (a $0 "comp_"
 * payment is recorded instead), see an "analyzing" screen, and get the canned
 * review below published instantly as a normal review. Used to record promo videos.
 */
export const DEMO_EMAILS = ["amaurydelille92500@gmail.com"];

export function isDemoUser(user: Pick<User, "email"> | null | undefined): boolean {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(email && DEMO_EMAILS.includes(email));
}

/** Rounds to 64 overall: (58 + 49 + 74 + 75) / 4. */
export const DEMO_SCORES: Scores = {
  pictures: 58,
  prompts: 49,
  conversation: 74,
  settings: 75,
};

export const DEMO_MARKDOWN = `## The quick verdict

You're right in the middle of the pack. Nothing here is a dealbreaker, but nothing makes someone stop scrolling either. Fix the three things in the plan at the bottom and you can realistically jump **15 to 20 points**.

## 📸 Pictures: 58

**Your first picture looks low effort.** It's the photo that decides most swipes, and right now it reads as "took this in 3 seconds before opening the app": flat indoor light, camera slightly below your chin, busy background. Even a good-looking guy loses points to this.

- **Too many selfies.** Three of your shots are arm's-length selfies. One is fine, three makes it look like nobody wants to take pictures of you.
- **The group photo is a puzzle.** It takes a few seconds to figure out which one is you. Crop it or move it after a clear solo shot.
- **What works:** the outdoor picture with natural light. You look relaxed and it's the best shot you have. **Make it your first picture.**

## ✍️ Prompts: 49

**The quote is cringe.** A motivational quote reads like a LinkedIn caption, and it tells her nothing about you. It's the single biggest drag on your score.

- **Nothing to reply to.** Your answers are short and closed. "Travel, food, gym" gives her no hook to start a conversation.
- **One prompt is a humblebrag.** It comes across as trying too hard. Keep it light, a little self-deprecating.

> Instead of a quote, try something specific: *"The way to win me over is… a recommendation for a hole-in-the-wall ramen spot I haven't tried yet."*

## 💬 Conversation: 74

Your openers are better than your profile. You reference what's on her profile instead of "hey", which already puts you ahead of most guys. Ask one more question per message and you'll get noticeably more replies.

## ⚙️ Settings: 75

Reasonable filters. Your distance is a bit tight for where you live: widening it slightly will give you a bigger pool without hurting quality.

## Your 3-step plan

1. **Swap your first picture** for the outdoor shot with natural light.
2. **Delete the quote** and replace it with a specific, easy-to-answer prompt.
3. **Cut two selfies** and add one picture of you doing something (sport, cooking, travel).
`;

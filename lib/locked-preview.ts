/**
 * Stand-in text shown blurred wherever a review is locked: the locked review
 * page and the paywall step of the submit sheet. It is never the real report
 * (that stays on the server until they pay), so un-blurring it in dev tools
 * reveals nothing.
 */
export const LOCKED_PREVIEW = [
  [
    "What's working",
    "Your first photo does a lot of heavy lifting and it shows. There's a real person here, and that's more than most profiles manage. The problem is everything that comes after it, which quietly undoes the good start.",
  ],
  [
    "Photos",
    "Photo two and photo four are telling the same story twice, and neither story is the one you want. Swap one of them for something that shows what a Saturday with you looks like. The group shot needs to go, or at least move way down.",
  ],
  [
    "Prompts",
    "Your prompts are safe in a way that reads as forgettable. Nobody can reply to this answer because there's nothing to grab onto. Here's a rewrite that keeps your voice but gives them an easy opener.",
  ],
  [
    "Conversations",
    "You're asking good questions, then answering them yourself two messages later. Leave room. The second thread died because the follow-up was an interview, not a conversation.",
  ],
  [
    "Try this next",
    "Reorder the photos, rewrite the two weakest prompts, and try the opener below on your next three matches. Then send it back and we'll see what moved.",
  ],
];

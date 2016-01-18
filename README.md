# Forum games enhancer
Creates an interactive scoreboard of the played game and adds a few enhancements

![Preview](http://eih.bz/s1/giftstl.gif)

Since the forum games at Bierdopje are one of the few active things
We feel they deserve a better way to manage the score.

This script aims to provide:
 - An interface where they can see the score per week or per month ( adjustable , so whatever )
  * New players can join with a score of `0` and still compete weekly / monthly.
 - A way to compare players

    eg: In the last week there were 7 questions. You solved 3, and another player solved 2.
    Because you solved 3 questions, you had to post 3 other questions as well.
    
    You have a percentage of 75%, the other player 40%.
    `(solved/(total - posted) *100)`
    
    Why `(total - posted)`? Well, because you can't answer your own questions.
    If we don't take this into account, you'd never be able to reach 100%
    
    You can reach 100% when you answered every question not posted by you correctly.
    
- A notifier when someone answered in a topic you follow
 * [DM, frontpage, or even a taskbar notification]
   * Requires extra rights.
- An 'accept answer' button with each response.
  * You click it, and the scoreboard is auto-updated and pasted into the reply-box
- A 'wrong anwer' button
  * You click it, and a template "@User; Verkeerd antwoord" is pasted into the reply-box
- Store questions/hints
  * Create questions when you have the time and use them with the click of a button.
  * Auto-post a next question when the player that normally has to post the next one hasn't done it in x days.
  * Auto-post a hint after x days.

 =============
 
Right now it fetches all comments in a forum and checks them for scores.
If it contains scores it extracts and formats it. Finally the scores are cached.
 
When the *newest* scoreboard on a page is more than a week old it is considered archived and will never be updated again.
This prevents us from bugging the Bierdopje servers over and over again.

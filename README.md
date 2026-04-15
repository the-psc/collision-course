Setup instructions

Loading the game: Run `python -m http.server 8000` In the "collision course" directory in the command line, then open: http://localhost:8000
Screen widths tested: 1250px - 1800px. Use browser zoom feature on larger monitor
Hit refresh after any change to window / zoom size
"Clear" button clears the leaderboard. Leaderboard will persist if game/browser refreshed but will disappear if cookies are cleared

<img width="1622" height="862" alt="image" src="https://github.com/user-attachments/assets/a2e3dfe4-40d0-4968-b198-36aaf00d1e17" />

If you make any changes to the code, hard refresh the page to view them (CTRL+SHIFT+r)

Config instructions - settings that can be easily tweaked
If you’re running locally: open your project folder → open game.js in VS Code (or any text editor) → edit → save → refresh the browser.

The settings are at the top of game.js inside const cfg = { ... }.

FUEL_MAX – Increase to make the game last longer and easier; decrease for shorter, harder runs.

DV_MAX – Increase to allow bigger manoeuvres; decrease to force smaller, more precise moves.

DV_STEP – Increase for faster up/down adjustments; decrease for finer control.

DV_COST_PER_UNIT – Increase to make manoeuvres more expensive (harder); decrease to encourage more burns (easier).

TCA_RANGE – Increase the numbers to make each round last longer; decrease for faster, more intense rounds.

START_PAUSE_SEC – Controls how many seconds the game waits before starting after pressing Begin.

SAT_DRAG – Increase to make the satellite animation move further from a burn; decrease for subtler movement.

FAST_FORWARD_MULT – Increase to speed up time more after locking a manoeuvre; decrease for slower fast-forward.

TH_BLUE / TH_YELLOW – Adjust when the heatmap turns from blue → yellow → red (visual risk sensitivity only).

HUD_WIDTH_FRAC – Change how wide the left HUD panel is (0.5 = half the screen).

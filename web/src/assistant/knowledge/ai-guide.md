# The AI guide itself

- Opens from **Ask the AI guide** in the calculator. The first time it asks for the user's own **Google Gemini API key** (free from Google AI Studio). The key stays in the browser and goes only to Google; it is forgotten when the tab closes unless "Remember on this device" is ticked. **Key settings → Forget key** removes it.
- Messages, the site list, the open sites' numbers and these reference notes are sent to Google Gemini.
- What it can do:
  - open catalog sites or typed locations with mission settings, or every catalog site for a general request;
  - explain any number, button, warning or low score, from the app's own results and these notes;
  - ask back when something important is missing or unclear;
  - suggest score weights for the user's priorities: in **Advisor** mode it shows the suggestion with an Apply button; in **Direct** mode it applies it at once (the user can undo with Back or the Score settings reset);
  - open **Select region**, explain it, and report the best areas once the user outlines one.
- It never invents numbers: results come from the app's calculations.

Sources: `web/src/ui/AssistantPanel.tsx`, `web/src/assistant/*`.

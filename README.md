# OrbisChat

A multi-persona chat room application built with LangGraph.js and Next.js. Each persona operates autonomously using OpenAI API, creating dynamic conversations in a chat room environment.

## Features

- **Multi-Persona System**: Create and manage multiple AI personas with customizable personalities
- **Autonomous Behavior**: Personas autonomously check the chat room and react based on their personality
- **Turn-Taking System**: Intelligent turn-taking with "typing..." indicators and conflict resolution
- **Thought Logging**: Personas generate thought logs before every action (hidden by default, visible in debug mode)
- **Local Data Storage**: All data stored in IndexedDB (browser database)
- **GitHub Pages Ready**: Static export for easy deployment

## Tech Stack

- **Frontend**: Next.js 14+ (App Router) + TypeScript
- **Styling**: TailwindCSS + HeroIcons
- **Chat Engine**: LangGraph.js (`@langchain/langgraph/web` for browser environment)
- **Data Persistence**: IndexedDB (Dexie.js)
- **Deployment**: GitHub Pages (static export)
- **API**: OpenAI API (global configuration)

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- OpenAI API key

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Export static site for GitHub Pages
npm run export
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Development Checkpoints

Use these checkpoints to verify functionality at each stage of development:

### Checkpoint 1: Project Setup ✅
- [ ] `npm run dev` starts successfully
- [ ] Application loads at http://localhost:3000
- [ ] TailwindCSS styles are applied correctly
- [ ] No console errors on initial load
- [ ] `npm run build` completes without errors

### Checkpoint 2: Database Setup ✅
- [ ] IndexedDB database is created successfully
- [ ] Can save data to IndexedDB (test with sample data)
- [ ] Can read data from IndexedDB
- [ ] Database schema is visible in browser DevTools (Application > IndexedDB)
- [ ] Dexie.js is properly configured
- [ ] All tables (personas, rooms, messages, thoughtLogs, settings) are created

### Checkpoint 3: Persona Management UI ✅
- [ ] Persona list page displays correctly
- [ ] Can create a new persona
- [ ] Can edit persona details (name, personality, system prompt)
- [ ] Can delete a persona
- [ ] Persona data persists in IndexedDB after page refresh
- [ ] Response delay multiplier setting works
- [ ] UI is responsive and styled with TailwindCSS

### Checkpoint 4: LangGraph Integration ✅
- [ ] LangGraph.js is imported correctly (`@langchain/langgraph/web`)
- [ ] Can create a LangGraph agent for a persona
- [ ] Agent processes mock chat history correctly
- [ ] Thought logs are generated before actions (check in debug mode)
- [ ] Agent state management works (chat history, thought logs, persona settings)
- [ ] No runtime errors in browser console

### Checkpoint 5: Chat Room UI ✅
- [ ] Chat room list displays correctly
- [ ] Can create a new chat room
- [ ] Can select/switch between chat rooms
- [ ] Messages display correctly (user and persona messages)
- [ ] User input form works
- [ ] Messages are saved to IndexedDB
- [ ] UI does not distinguish between user and persona messages (AI is indistinguishable)
- [ ] Real-time updates work when new messages are added

### Checkpoint 6: Turn-Taking System ✅
- [ ] "Typing..." indicator displays when persona intends to write
- [ ] Typing indicator shows persona name
- [ ] Global speed setting affects typing duration
- [ ] Persona-specific delay multiplier works correctly
- [ ] Multiple personas can show typing indicators simultaneously
- [ ] Conflict detection works when multiple personas type at once
- [ ] Cancellation logic works (persona decides to cancel based on personality)
- [ ] Messages appear after typing delay completes

### Checkpoint 7: Autonomous Behavior System ✅
- [ ] Personas periodically check the chat room (background polling)
- [ ] Personas react to new messages autonomously
- [ ] Personas generate thought logs even when not taking action
- [ ] Thought-only execution works (thinking without posting)
- [ ] Autonomous behavior respects global speed settings
- [ ] Multiple personas can operate independently
- [ ] No performance issues with multiple active personas

### Checkpoint 8: API Integration ✅
- [ ] OpenAI API key can be set in settings
- [ ] API calls are made correctly with proper authentication
- [ ] Model selection works (user can choose OpenAI model)
- [ ] API responses are processed correctly
- [ ] Error handling works for API failures
- [ ] Rate limiting queue system works
- [ ] Concurrent request limiting prevents rate limit errors
- [ ] 429 errors trigger automatic retry with exponential backoff
- [ ] User is notified of rate limit errors
- [ ] Request interval control prevents rapid-fire requests

### Checkpoint 9: Settings & Debug Mode ✅
- [ ] Settings page displays correctly
- [ ] Global speed setting can be changed
- [ ] Debug mode toggle works
- [ ] When debug mode is ON, thought logs are visible in UI
- [ ] When debug mode is OFF, thought logs are hidden
- [ ] Console logs are output correctly (check browser console)
- [ ] Structured logging works (DEBUG, INFO, WARN, ERROR levels)

### Checkpoint 10: Data Management ✅
- [ ] Can delete messages
- [ ] Can delete chat rooms
- [ ] Can delete personas
- [ ] Data export to JSON works
- [ ] Exported JSON contains all data (personas, rooms, messages, thought logs)
- [ ] IndexedDB capacity warnings display when approaching limits
- [ ] Data persists correctly after browser restart

### Checkpoint 11: Styling & Polish ✅
- [ ] TailwindCSS styles are applied throughout
- [ ] HeroIcons display correctly
- [ ] UI is responsive (works on mobile/tablet/desktop)
- [ ] Animations work smoothly (typing indicators, transitions)
- [ ] Color scheme is consistent
- [ ] Loading states are displayed appropriately
- [ ] Error states are styled and user-friendly

### Checkpoint 12: GitHub Pages Deployment ✅
- [ ] `npm run build` completes successfully
- [ ] Static export generates correctly
- [ ] `basePath: '/OrbisChat'` is configured in next.config.js
- [ ] All assets load correctly with basePath
- [ ] Application works when deployed to GitHub Pages
- [ ] No broken links or missing assets
- [ ] IndexedDB works in production build

## Project Structure

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Main chat room page
│   ├── personas/
│   │   └── page.tsx          # Persona management
│   ├── settings/
│   │   └── page.tsx          # Settings (speed, debug mode)
│   └── globals.css
├── lib/
│   ├── db.ts                 # IndexedDB configuration
│   ├── langgraph/
│   │   └── persona-agent.ts  # LangGraph agent implementation
│   ├── api-queue.ts          # API request queue & rate limiting
│   ├── turn-taking.ts        # Turn-taking logic
│   ├── logger.ts             # Structured logging system
│   └── data-export.ts        # Data export functionality
├── components/
│   ├── ChatRoom.tsx
│   ├── MessageList.tsx       # Message display (user/persona indistinguishable)
│   ├── PersonaManager.tsx
│   ├── PersonaCard.tsx
│   ├── TypingIndicator.tsx
│   ├── DebugPanel.tsx        # Debug mode panel with toggle
│   └── DataManagement.tsx    # Data delete & export UI
├── hooks/
│   ├── useChatRoom.ts
│   ├── useDebugMode.ts       # Debug mode toggle hook
│   └── usePersonaAutonomy.ts # Autonomous persona behavior management
└── next.config.js            # GitHub Pages configuration
```

## Key Implementation Details

### LangGraph Agents
- Each persona has an independent LangGraph graph
- Agents autonomously check chat room and react based on personality
- State management includes: chat history, thought logs, persona settings
- Uses `@langchain/langgraph/web` for browser compatibility

### Turn-Taking System
- Writing intent is managed as state
- When conflicts occur, LangGraph infers cancellation from personality (not numeric parameters)
- Global speed × persona multiplier determines typing duration

### Thought Logs
- Generated before every action
- Also generated periodically even when no action is taken
- Stored in IndexedDB, hidden by default
- Visible in debug mode (UI and console)

### Logging System
- Structured logging with levels: DEBUG, INFO, WARN, ERROR
- Context includes: persona ID, room ID, timestamp
- Performance logs: API request times, rate limit status
- Thought logs output to console in debug mode

## Configuration

### Environment Variables

Create a `.env.local` file (optional - API key can be set in UI):

```env
NEXT_PUBLIC_OPENAI_API_KEY=your_api_key_here
```

Note: API key can also be configured in the application settings UI.

### GitHub Pages Setup

1. Build the project: `npm run build`
2. The `out` directory contains the static files
3. Configure GitHub Pages to serve from `/docs` or use GitHub Actions
4. Ensure `basePath: '/OrbisChat'` matches your repository name

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


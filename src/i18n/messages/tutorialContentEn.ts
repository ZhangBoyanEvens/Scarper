import type { MessageTree } from '../types'

export const tutorialContentEn: MessageTree = {
  phases: {
    overview: 'Overview',
    setup: 'Setup',
    scrape: 'Scrape',
    manage: 'Manage',
    documents: 'Documents',
    wrapUp: 'Wrap-up',
    done: 'Done',
  },
  steps: {
    overview: {
      title: 'What Scarper does',
      summary:
        'Scarper connects web pages → structured knowledge → project library → editing and AI collaboration. Follow the steps below for a full scrape-to-archive workflow.',
      checklist: {
        '0': 'Start: sign in on Homepage (app default landing)',
        '1': 'Scrape: enter URLs to get title, summary, key points, and body text',
        '2': 'Store: upload results to a Neon cloud Project (per account quota)',
        '3': 'Refine: generate documents in FinDoc / RAG Chat',
      },
    },
    signIn: {
      title: 'Sign in on Homepage',
      summary:
        'The app opens on Homepage by default — the only sign-in entry. Before login the top bar shows Homepage only; after Clerk sign-in you unlock Project, Tools, and Setting.',
      checklist: {
        '0': 'Launch the app to see Homepage (brand animation left, sign-in right)',
        '1': 'Complete Sign in / Sign up on the right',
        '2': 'After login, Start and /Tutorial appear; full navigation unlocks',
      },
      tip: 'If sign-in is unavailable, check VITE_CLERK_PUBLISHABLE_KEY in .env.',
      navigate: 'Open Homepage',
    },
    tools: {
      title: 'Pick a tool from Tools',
      summary:
        'After login, open Tools from the top bar and choose Scrape, FinDoc, Template, or RAG Chat. You can also click Start on Homepage to go straight to Scrape.',
      checklist: {
        '0': 'Click Tools in the top bar (or Start on Homepage for Scrape)',
        '1': 'Select Scrape on Tools to begin web scraping',
        '2': 'FinDoc / Template / RAG are used in later steps',
      },
      navigate: 'Open Tools',
    },
    scrape: {
      title: 'Scrape: submit URLs',
      summary:
        'On Scrape, enter one or more URLs (newline or comma separated), choose output language and detail level, then run. The system picks HTTP or Playwright and AI generates summaries.',
      checklist: {
        '0': 'Paste target links in the search bar and submit',
        '1': 'Watch the task progress bar and per-URL scrape status',
        '2': 'Set global output language and detail in Setting → Language (Scrape toolbar syncs)',
      },
      tip: 'While scraping runs, a dot appears beside Tools — avoid resubmitting the same task.',
      navigate: 'Open Scrape',
    },
    scrapeUpload: {
      title: 'Merge results and upload',
      summary:
        'Edit, copy, or export single results; merge multiple successful results with Merge. At the bottom Project area, pick a target project and upload to Neon.',
      checklist: {
        '0': 'Confirm result cards show success before uploading',
        '1': 'Select a Project at the bottom; choose whether to include full body text',
        '2': 'After upload, refresh the record list on the Project page',
      },
      navigate: 'Open Scrape',
    },
    project: {
      title: 'Project: projects and records',
      summary:
        'The Project page manages cloud project groups. View storage usage (~200MB/account) on the left, browse projects in the middle, and inspect scrape records on the right — open FinDoc from a record.',
      checklist: {
        '0': 'Click New Project to create a group',
        '1': 'Select a project to view its record list and source URLs',
        '2': 'Launch a FinDoc task from a record when ready',
      },
      navigate: 'Open Project',
    },
    findoc: {
      title: 'FinDoc: templates and final docs',
      summary:
        'FinDoc combines multiple Task sources into a formal document using the selected Template structure. Pick template and tasks above; add rewrite instructions in the left Prompt; Proceed runs AI layout per template and prompt.',
      checklist: {
        '0': 'Tools → Template: create or analyze template structure',
        '1': 'Tools → FinDoc: select project, template, and Tasks',
        '2': 'Proceed to generate formatted output and save to project',
      },
      navigate: 'Open FinDoc',
    },
    rag: {
      title: 'RAG Chat: library-grounded Q&A',
      summary:
        'RAG Chat lets you highlight Task body text and ask AI questions. Answers are strictly grounded in stored content — good for fact checks and comparing passages, not re-scraping the web.',
      checklist: {
        '0': 'Tools → RAG Chat',
        '1': 'Select project and Task; highlight text to reference',
        '2': 'Ask in the input box and review contextual answers',
      },
      navigate: 'Open RAG Chat',
    },
    settings: {
      title: 'Setting: preferences and diagnostics',
      summary:
        'Setting centralizes global language presets, workflow, API base, interface, and storage. Set Scrape / FinDoc defaults on Language; when deploying or debugging, run backend health checks on Test first.',
      checklist: {
        '0': 'Confirm API Base points to local or production backend',
        '1': 'Run connection test; status should be ok',
        '2': 'Diagnostics shows recent scrapes and routing (if enabled)',
      },
      tip: 'Neon and DeepSeek keys live only in backend .env — never in the frontend.',
      navigate: 'Open Setting',
    },
    done: {
      title: 'You are all set',
      summary:
        'Recommended path: Homepage sign-in → Tools (or Start) → Scrape → upload to Project → (optional) FinDoc / RAG. On failure, check API and Diagnostics in Setting.',
      checklist: {
        '0': 'Completed all tutorial steps',
        '1': 'Next launch still defaults to Homepage; revisit /Tutorial anytime',
        '2': 'For site-wide scrape benchmarks see backend/reports',
      },
    },
  },
  stepProgress: 'Step {{current}} / {{total}}',
  progressAria: 'Tutorial progress {{pct}}%',
  stepsAria: 'Tutorial steps',
  workflowOverview: 'Workflow overview',
  tryHint:
    'When ready, click "{{label}}" at the bottom to work in the live page, then return here for the next step.',
}

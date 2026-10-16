export interface DshPluginItem {
  id: string;
  name: string;
  version: string;
  description: string;
  status: "active" | "disabled" | "pending";
  category: "session" | "global";
}

export const DSH_SESSION_PLUGINS: DshPluginItem[] = [
  {
    "id": "dsh-agent",
    "name": "@deepseek-ai/dsh-agent",
    "version": "0.2.0-rc.2",
    "description": "Agent interface, registry, initiator scope, and event vocabulary for the DeepSeek Harness",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-agent-default-model",
    "name": "@deepseek-ai/dsh-agent-default-model",
    "version": "0.2.0-rc.2",
    "description": "Default model selection shared by Agent entry points",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-agent-instructions",
    "name": "@deepseek-ai/dsh-agent-instructions",
    "version": "0.2.0-rc.2",
    "description": "Workspace context loader for AGENTS.md/CLAUDE.md instruction files",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-agent-loop",
    "name": "@deepseek-ai/dsh-agent-loop",
    "version": "0.2.0-rc.2",
    "description": "The concrete agent loop plugin for the DeepSeek Harness",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-agent-preset",
    "name": "@deepseek-ai/dsh-agent-preset",
    "version": "0.2.0-rc.2",
    "description": "Declare an Agent capability composition in Cordis YAML",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-agent-preset-registry",
    "name": "@deepseek-ai/dsh-agent-preset-registry",
    "version": "0.2.0-rc.2",
    "description": "Declarative Agent preset registry and profile-backed editing",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-agent-tool-presentation",
    "name": "@deepseek-ai/dsh-agent-tool-presentation",
    "version": "0.2.0-rc.2",
    "description": "Agent-plane presentation selector: composes one agent's tools as PTC mode, native, or both",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-bash-local",
    "name": "@deepseek-ai/dsh-bash-local",
    "version": "0.2.0-rc.2",
    "description": "Local-subprocess implementation of the DeepSeek Harness bash executor seam",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-bash-sandbox",
    "name": "@deepseek-ai/dsh-bash-sandbox",
    "version": "0.2.0-rc.2",
    "description": "Sandbox-consuming implementation of the DeepSeek Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts)",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-agent-preset",
    "name": "@deepseek-ai/dsh-client-ui-agent-preset",
    "version": "0.2.0-rc.2",
    "description": "Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-approval",
    "name": "@deepseek-ai/dsh-client-ui-approval",
    "version": "0.2.0-rc.2",
    "description": "Approval composer takeover over the scoped Remote Event waterfall",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-goal",
    "name": "@deepseek-ai/dsh-client-ui-goal",
    "version": "0.2.0-rc.2",
    "description": "Session goal surface: GoalBar docked above the composer, read from the goal session projection",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-permission-presets",
    "name": "@deepseek-ai/dsh-client-ui-permission-presets",
    "version": "0.2.0-rc.2",
    "description": "Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-settings-agent-loop",
    "name": "@deepseek-ai/dsh-client-ui-settings-agent-loop",
    "version": "0.2.0-rc.2",
    "description": "Settings page of the agent loop on the dsh web client's Plugins page: the parallel tool-call cap of the agent-loop namespace",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-settings-subagent",
    "name": "@deepseek-ai/dsh-client-ui-settings-subagent",
    "version": "0.2.0-rc.2",
    "description": "Settings page of Subagent delegation on the dsh web client's Plugins page: recursion depth, parallel capacity, and the models agents may choose for subagents",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-settings-web-search",
    "name": "@deepseek-ai/dsh-client-ui-settings-web-search",
    "version": "0.2.0-rc.2",
    "description": "Settings page of the DeepSeek web-search provider on the dsh web client's Plugins page: its API key, endpoint, and per-request search budget",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-subagent",
    "name": "@deepseek-ai/dsh-client-ui-subagent",
    "version": "0.2.0-rc.2",
    "description": "Subagent conversation catalog, continuation routing UI, and '@' reference source",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-client-ui-workflow-run",
    "name": "@deepseek-ai/dsh-client-ui-workflow-run",
    "version": "0.2.0-rc.2",
    "description": "Durable workflow-run Conversation Node and nested member disclosure for dsh web",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-command-goal",
    "name": "@deepseek-ai/dsh-command-goal",
    "version": "0.2.0-rc.2",
    "description": "Human-facing slash command for persisted same-session goals",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-compaction-tool-result-pruner",
    "name": "@deepseek-ai/dsh-compaction-tool-result-pruner",
    "version": "0.2.0-rc.2",
    "description": "Replay-safe model-free head/middle/tail pruning for tool-result surface nodes",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-experimental-agent-team",
    "name": "@deepseek-ai/dsh-experimental-agent-team",
    "version": "0.2.0-rc.2",
    "description": "Implicit-root Agent Teams roster, durable peer mailbox, and shared task DAG",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-experimental-agent-team-profile",
    "name": "@deepseek-ai/dsh-experimental-agent-team-profile",
    "version": "0.2.0-rc.2",
    "description": "Agent Teams collaboration, tools, and Web UI in one experimental bundle",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-experimental-client-ui-agent-team",
    "name": "@deepseek-ai/dsh-experimental-client-ui-agent-team",
    "version": "0.2.0-rc.2",
    "description": "Web Agent Teams roster, task board, and teammate navigation",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-experimental-tool-agent-team",
    "name": "@deepseek-ai/dsh-experimental-tool-agent-team",
    "version": "0.2.0-rc.2",
    "description": "Scoped model-facing Agent Teams tools over ctx.agentTeams",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-fs",
    "name": "@deepseek-ai/dsh-fs",
    "version": "0.2.0-rc.2",
    "description": "Abstract filesystem capability seam (ctx.fs) for the DeepSeek Harness — vocabulary types, the FileSystem service (text IO + optional version-guarded atomic mutations), and the fs/* policy event vocabulary",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-fs-local",
    "name": "@deepseek-ai/dsh-fs-local",
    "version": "0.2.0-rc.2",
    "description": "Local-filesystem implementation of the DeepSeek Harness filesystem seam (ctx.fs)",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-fs-observation-policy",
    "name": "@deepseek-ai/dsh-fs-observation-policy",
    "version": "0.2.0-rc.2",
    "description": "File-context policy plugin for the DeepSeek Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API)",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-fs-sandbox",
    "name": "@deepseek-ai/dsh-fs-sandbox",
    "version": "0.2.0-rc.2",
    "description": "Sandbox-enforcing implementation of the DeepSeek Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through",
    "status": "active",
    "category": "session"
  },
  {
    "id": "dsh-goal",
    "name": "@deepseek-ai/dsh-goal",
    "version": "0.2.0-rc.2",
    "description": "Event-sourced same-session goal state and lifecycle service for the DeepSeek Harness",
    "status": "active",
    "category": "session"
  }
];

export const DSH_GLOBAL_PLUGINS: DshPluginItem[] = [
  {
    "id": "cordis",
    "name": "@deepseek-ai/cordis",
    "version": "4.0.4",
    "description": "Meta-Framework for Modern JavaScript Applications",
    "status": "active",
    "category": "global"
  },
  {
    "id": "cordis-plugin-group",
    "name": "@deepseek-ai/cordis-plugin-group",
    "version": "1.0.4",
    "description": "Nested plugin group for cordis",
    "status": "active",
    "category": "global"
  },
  {
    "id": "cordis-plugin-include",
    "name": "@deepseek-ai/cordis-plugin-include",
    "version": "1.0.9",
    "description": "Include files in cordis configurations",
    "status": "active",
    "category": "global"
  },
  {
    "id": "cordis-plugin-loader",
    "name": "@deepseek-ai/cordis-plugin-loader",
    "version": "1.0.5",
    "description": "Plugin loader for cordis",
    "status": "active",
    "category": "global"
  },
  {
    "id": "cordis-plugin-timer",
    "name": "@deepseek-ai/cordis-plugin-timer",
    "version": "1.1.6",
    "description": "Timer service for cordis",
    "status": "active",
    "category": "global"
  },
  {
    "id": "cosmokit",
    "name": "@deepseek-ai/cosmokit",
    "version": "1.8.5",
    "description": "A collection of common utilities",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh",
    "name": "@deepseek-ai/dsh",
    "version": "0.2.0-rc.2",
    "description": "dsh CLI: profile launch, plugin management, and configuration inspection",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-acp",
    "name": "@deepseek-ai/dsh-acp",
    "version": "0.2.0-rc.2",
    "description": "Automation-only Agent Client Protocol server for driving DeepSeek Harness agents over JSON-RPC stdio",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-acp-app",
    "name": "@deepseek-ai/dsh-acp-app",
    "version": "0.2.0-rc.2",
    "description": "The dsh ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over dsh-base",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-anonymous-user-id",
    "name": "@deepseek-ai/dsh-anonymous-user-id",
    "version": "0.2.0-rc.2",
    "description": "Shared anonymous user identity for DeepSeek Harness telemetry and feedback correlation",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-account-controller",
    "name": "@deepseek-ai/dsh-api-account-controller",
    "version": "0.2.0-rc.2",
    "description": "Expose safe account operations over authenticated Remote",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-gateway",
    "name": "@deepseek-ai/dsh-api-gateway",
    "version": "0.2.0-rc.2",
    "description": "Typert Remote Host dispatcher and Client API endpoint",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-job-controller",
    "name": "@deepseek-ai/dsh-api-job-controller",
    "version": "0.2.0-rc.2",
    "description": "Job Remote observation stream and the reference-counted client job-output service",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-remotes",
    "name": "@deepseek-ai/dsh-api-remotes",
    "version": "0.2.0-rc.2",
    "description": "Remote BFF assembly for application-selected Host capabilities",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-session-controller",
    "name": "@deepseek-ai/dsh-api-session-controller",
    "version": "0.2.0-rc.2",
    "description": "Session Remote commands, cold reads, and live control transport",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-settings-controller",
    "name": "@deepseek-ai/dsh-api-settings-controller",
    "version": "0.2.0-rc.2",
    "description": "Remote owner for the configuration surfaces over the settings-domain seams",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-terminal-controller",
    "name": "@deepseek-ai/dsh-api-terminal-controller",
    "version": "0.2.0-rc.2",
    "description": "Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-workspace-controller",
    "name": "@deepseek-ai/dsh-api-workspace-controller",
    "version": "0.2.0-rc.2",
    "description": "Workspace Remote commands and reconnect-safe state transport",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-api-workspace-files",
    "name": "@deepseek-ai/dsh-api-workspace-files",
    "version": "0.2.0-rc.2",
    "description": "Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-app-boot",
    "name": "@deepseek-ai/dsh-app-boot",
    "version": "0.2.0-rc.2",
    "description": "Shared boot glue for the app bins: .env loading, fail-loud Loader guards, snapshot-aware config resolution, and the Loader boot sequence",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-atomic-write",
    "name": "@deepseek-ai/dsh-atomic-write",
    "version": "0.2.0-rc.2",
    "description": "Zero-dependency atomic file replacement: exclusive-create random-suffix temp + rename carrying the caller-stated permissions (writeFileAtomic)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-attachment",
    "name": "@deepseek-ai/dsh-attachment",
    "version": "0.2.0-rc.2",
    "description": "Durable immutable attachment storage seam for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-attachment-local",
    "name": "@deepseek-ai/dsh-attachment-local",
    "version": "0.2.0-rc.2",
    "description": "Private content-addressed DSH_HOME attachment storage",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-authorization",
    "name": "@deepseek-ai/dsh-authorization",
    "version": "0.2.0-rc.2",
    "description": "Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-base",
    "name": "@deepseek-ai/dsh-base",
    "version": "0.2.0-rc.2",
    "description": "The shared dsh core as a profile bundle: the first patch layer of base-backed profiles, inserting core rows over the empty profile root",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-brand",
    "name": "@deepseek-ai/dsh-brand",
    "version": "0.2.0-rc.2",
    "description": "Stateless branded primitive types for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-chunked-list",
    "name": "@deepseek-ai/dsh-chunked-list",
    "version": "0.2.0-rc.2",
    "description": "Persistent append-only chunked lists with bounded copying and JSON checkpoint validation",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-connection",
    "name": "@deepseek-ai/dsh-client-connection",
    "version": "0.2.0-rc.2",
    "description": "Authenticated RPC transport and generation lifecycle",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-file-upload",
    "name": "@deepseek-ai/dsh-client-file-upload",
    "version": "0.2.0-rc.2",
    "description": "Agent-scoped browser file upload, streaming intake, and staged receipt service",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-hmr",
    "name": "@deepseek-ai/dsh-client-hmr",
    "version": "0.2.0-rc.2",
    "description": "Web client graph synchronization and rebuilt-bundle reload transport",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-locale",
    "name": "@deepseek-ai/dsh-client-locale",
    "version": "0.2.0-rc.2",
    "description": "Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-modules",
    "name": "@deepseek-ai/dsh-client-modules",
    "version": "0.2.0-rc.2",
    "description": "Client module system, dual-face: node half composes the __DSH_BOOT__ entry graph (incremental dsh.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-product-analytics",
    "name": "@deepseek-ai/dsh-client-product-analytics",
    "version": "0.2.0-rc.2",
    "description": "Desktop product event collection and authenticated Host reporting",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-resources",
    "name": "@deepseek-ai/dsh-client-resources",
    "version": "0.2.0-rc.2",
    "description": "Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-shortcuts",
    "name": "@deepseek-ai/dsh-client-shortcuts",
    "version": "0.2.0-rc.2",
    "description": "Application keyboard command registry and physical-key routing",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-store",
    "name": "@deepseek-ai/dsh-client-store",
    "version": "0.2.0-rc.2",
    "description": "React-free observable and snapshot-store contracts with the shared Zustand/Immer engine",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-attachment",
    "name": "@deepseek-ai/dsh-client-ui-attachment",
    "version": "0.2.0-rc.2",
    "description": "Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-brand-official",
    "name": "@deepseek-ai/dsh-client-ui-brand-official",
    "version": "0.2.0-rc.2",
    "description": "Official DeepSeek Harness brand occupants for the Web client's sidebar slots",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-chat",
    "name": "@deepseek-ai/dsh-client-ui-chat",
    "version": "0.2.0-rc.2",
    "description": "Chat Conversation target, node definitions, renderers, and details surface",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-commands",
    "name": "@deepseek-ai/dsh-client-ui-commands",
    "version": "0.2.0-rc.2",
    "description": "Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-conversation",
    "name": "@deepseek-ai/dsh-client-ui-conversation",
    "version": "0.2.0-rc.2",
    "description": "Target-neutral Conversation assembly, shell, composer, queue, and view navigation",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-cordis",
    "name": "@deepseek-ai/dsh-client-ui-cordis",
    "version": "0.2.0-rc.2",
    "description": "Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-deliverables",
    "name": "@deepseek-ai/dsh-client-ui-deliverables",
    "version": "0.2.0-rc.2",
    "description": "Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-directory-picker-browse",
    "name": "@deepseek-ai/dsh-client-ui-directory-picker-browse",
    "version": "0.2.0-rc.2",
    "description": "In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-directory-picker-native",
    "name": "@deepseek-ai/dsh-client-ui-directory-picker-native",
    "version": "0.2.0-rc.2",
    "description": "Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-input-trigger",
    "name": "@deepseek-ai/dsh-client-ui-input-trigger",
    "version": "0.2.0-rc.2",
    "description": "Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-jobs",
    "name": "@deepseek-ai/dsh-client-ui-jobs",
    "version": "0.2.0-rc.2",
    "description": "Session-header background-job list with on-demand streaming record panels",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-layout",
    "name": "@deepseek-ai/dsh-client-ui-layout",
    "version": "0.2.0-rc.2",
    "description": "Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-message-feedback",
    "name": "@deepseek-ai/dsh-client-ui-message-feedback",
    "version": "0.2.0-rc.2",
    "description": "The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-model-selection",
    "name": "@deepseek-ai/dsh-client-ui-model-selection",
    "version": "0.2.0-rc.2",
    "description": "Model selection over the shared model catalog, Session projection, and session.selectModel",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-open-in-app",
    "name": "@deepseek-ai/dsh-client-ui-open-in-app",
    "version": "0.2.0-rc.2",
    "description": "Web \"Open In...\" controls: the Session-header split button opening the workspace directory in an installed application, and the document preview's default-application controls for one file",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-plan",
    "name": "@deepseek-ai/dsh-client-ui-plan",
    "version": "0.2.0-rc.2",
    "description": "Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-plugin-manager",
    "name": "@deepseek-ai/dsh-client-ui-plugin-manager",
    "version": "0.2.0-rc.2",
    "description": "Plugin management for the dsh web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-primitives",
    "name": "@deepseek-ai/dsh-client-ui-primitives",
    "version": "0.2.0-rc.2",
    "description": "Pure React atoms for the dsh web UI: controls, icons, markdown, and JSON inspectors (zero cordis)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-reference",
    "name": "@deepseek-ai/dsh-client-ui-reference",
    "version": "0.2.0-rc.2",
    "description": "Unified Web @file and @session reference source",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-renderer",
    "name": "@deepseek-ai/dsh-client-ui-renderer",
    "version": "0.2.0-rc.2",
    "description": "Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-schedule",
    "name": "@deepseek-ai/dsh-client-ui-schedule",
    "version": "0.2.0-rc.2",
    "description": "Host task management page and Session reminder catalog",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-session",
    "name": "@deepseek-ai/dsh-client-ui-session",
    "version": "0.2.0-rc.2",
    "description": "Session Controller adapter for React and session-scoped slots",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings",
    "name": "@deepseek-ai/dsh-client-ui-settings",
    "version": "0.2.0-rc.2",
    "description": "Settings domain base plugin: shared configuration forms and the canonical settings slot-type contract",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-account",
    "name": "@deepseek-ai/dsh-client-ui-settings-account",
    "version": "0.2.0-rc.2",
    "description": "Manage DeepSeek login and open Platform billing pages",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-general",
    "name": "@deepseek-ai/dsh-client-ui-settings-general",
    "version": "0.2.0-rc.2",
    "description": "Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-models",
    "name": "@deepseek-ai/dsh-client-ui-settings-models",
    "version": "0.2.0-rc.2",
    "description": "Models settings and shared product-onboarding dialogs over existing settings and credential joins",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-plugin-inventory",
    "name": "@deepseek-ai/dsh-client-ui-settings-plugin-inventory",
    "version": "0.2.0-rc.2",
    "description": "Read-only Cordis Loader inventory tab in Web Plugins settings",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-plugins",
    "name": "@deepseek-ai/dsh-client-ui-settings-plugins",
    "version": "0.2.0-rc.2",
    "description": "Built-in plugins settings section for the dsh web client: the Settings navigation entry and the tab chrome feature-owned tabs register into",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-session-log",
    "name": "@deepseek-ai/dsh-client-ui-settings-session-log",
    "version": "0.2.0-rc.2",
    "description": "General settings control for Session-log upload with DeepSeek API requests",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-settings-shell",
    "name": "@deepseek-ai/dsh-client-ui-settings-shell",
    "version": "0.2.0-rc.2",
    "description": "Settings page of the shell executor on the dsh web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-shortcuts",
    "name": "@deepseek-ai/dsh-client-ui-shortcuts",
    "version": "0.2.0-rc.2",
    "description": "Keyboard shortcut reference, recording, and local preference editing",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-sidebar",
    "name": "@deepseek-ai/dsh-client-ui-sidebar",
    "version": "0.2.0-rc.2",
    "description": "Sidebar plugin: session multi-level tree, search, grouping, state dots",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-sidebar-browser",
    "name": "@deepseek-ai/dsh-client-ui-sidebar-browser",
    "version": "0.2.0-rc.2",
    "description": "Sandboxed Web browser tabs for the right Sidebar",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-sidebar-documentpreview",
    "name": "@deepseek-ai/dsh-client-ui-sidebar-documentpreview",
    "version": "0.2.0-rc.2",
    "description": "Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain text",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-sidebar-files",
    "name": "@deepseek-ai/dsh-client-ui-sidebar-files",
    "version": "0.2.0-rc.2",
    "description": "Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-sidebar-right",
    "name": "@deepseek-ai/dsh-client-ui-sidebar-right",
    "version": "0.2.0-rc.2",
    "description": "Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-sidebar-terminal",
    "name": "@deepseek-ai/dsh-client-ui-sidebar-terminal",
    "version": "0.2.0-rc.2",
    "description": "Interactive shell tabs for the right Sidebar",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-skill",
    "name": "@deepseek-ai/dsh-client-ui-skill",
    "version": "0.2.0-rc.2",
    "description": "Web skill references and the dedicated skill tool row",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-slots",
    "name": "@deepseek-ai/dsh-client-ui-slots",
    "version": "0.2.0-rc.2",
    "description": "Slot registry pure core: typed ordinary Slots and reusable Component Factories, derived props, Store seats, and renderer installation",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-theme",
    "name": "@deepseek-ai/dsh-client-ui-theme",
    "version": "0.2.0-rc.2",
    "description": "Theme plugin: Host bootstrap for the pre-plugin palette; DOM-free ThemeRuntime for light/dark/system state; --dsw-* token styles and Appearance settings row",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-tool",
    "name": "@deepseek-ai/dsh-client-ui-tool",
    "version": "0.2.0-rc.2",
    "description": "Client Tool call-tree renderer and keyed per-tool presentation slot",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-trajectory",
    "name": "@deepseek-ai/dsh-client-ui-trajectory",
    "version": "0.2.0-rc.2",
    "description": "Trajectory event ledger with an interactive timing overview: pure-consumer plugin registering into the conversation ViewMap (no service)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-user-questions",
    "name": "@deepseek-ai/dsh-client-ui-user-questions",
    "version": "0.2.0-rc.2",
    "description": "Web ask_user_question composer takeover and plan-review presentation UI",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-client-ui-workspace",
    "name": "@deepseek-ai/dsh-client-ui-workspace",
    "version": "0.2.0-rc.2",
    "description": "Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-cmdline",
    "name": "@deepseek-ai/dsh-cmdline",
    "version": "0.2.0-rc.2",
    "description": "Immutable command-line handoff from a dsh launcher to any app plugin that injects cmdlineArgs",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-command-compact",
    "name": "@deepseek-ai/dsh-command-compact",
    "version": "0.2.0-rc.2",
    "description": "Human-facing slash command for explicit session compaction",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-command-feedback",
    "name": "@deepseek-ai/dsh-command-feedback",
    "version": "0.2.0-rc.2",
    "description": "Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-commands",
    "name": "@deepseek-ai/dsh-commands",
    "version": "0.2.0-rc.2",
    "description": "Plugin-owned human command registry for DeepSeek Harness UIs",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-compaction",
    "name": "@deepseek-ai/dsh-compaction",
    "version": "0.2.0-rc.2",
    "description": "Abstract compaction service seam (ctx.compaction) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-compaction-basic",
    "name": "@deepseek-ai/dsh-compaction-basic",
    "version": "0.2.0-rc.2",
    "description": "Token-meter-driven compaction policy and LLM summarization backend for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-compaction-image-offload",
    "name": "@deepseek-ai/dsh-compaction-image-offload",
    "version": "0.2.0-rc.2",
    "description": "Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-config-editor",
    "name": "@deepseek-ai/dsh-config-editor",
    "version": "0.2.0-rc.2",
    "description": "Persist plugin configuration through profile patches and Loader reconciliation",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-cordis-client-runner",
    "name": "@deepseek-ai/dsh-cordis-client-runner",
    "version": "0.2.0-rc.2",
    "description": "Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-cordis-host-runner",
    "name": "@deepseek-ai/dsh-cordis-host-runner",
    "version": "0.2.0-rc.2",
    "description": "Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-credentials",
    "name": "@deepseek-ai/dsh-credentials",
    "version": "0.2.0-rc.2",
    "description": "Abstract credential seam (ctx.credentials): settings carry references to secrets, providers own the values",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-credentials-local",
    "name": "@deepseek-ai/dsh-credentials-local",
    "version": "0.2.0-rc.2",
    "description": "File-backed credentials provider ($DSH_HOME/.env under the live process environment) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-deepseek-account",
    "name": "@deepseek-ai/dsh-deepseek-account",
    "version": "0.2.0-rc.2",
    "description": "Read account state and resolve official API credentials",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-deepseek-account-platform",
    "name": "@deepseek-ai/dsh-deepseek-account-platform",
    "version": "0.2.0-rc.2",
    "description": "Authorize DeepSeek accounts through browser PKCE",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-deepseek-llm-api-extensions",
    "name": "@deepseek-ai/dsh-deepseek-llm-api-extensions",
    "version": "0.2.0-rc.2",
    "description": "Additive request-field registry for the official DeepSeek LLM API adapter",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-deque",
    "name": "@deepseek-ai/dsh-deque",
    "version": "0.2.0-rc.2",
    "description": "Zero-dependency circular deque with amortized constant-time end operations and bounded vacant storage",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-api-speech-to-text",
    "name": "@deepseek-ai/dsh-experimental-api-speech-to-text",
    "version": "0.2.0-rc.2",
    "description": "Authenticated experimental speech transcription for browser clients",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-auto-review",
    "name": "@deepseek-ai/dsh-experimental-auto-review",
    "version": "0.2.0-rc.2",
    "description": "Per-tool LLM authorization review for the DeepSeek Harness Auto permission preset",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-client-ui-voice-input",
    "name": "@deepseek-ai/dsh-experimental-client-ui-voice-input",
    "version": "0.2.0-rc.2",
    "description": "Record speech and insert editable text into the conversation draft",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-schedule-bundle",
    "name": "@deepseek-ai/dsh-experimental-schedule-bundle",
    "version": "0.2.0-rc.2",
    "description": "Optional bundle that adds Schedule, its task page, and time context to the Web composition",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-speech-to-text",
    "name": "@deepseek-ai/dsh-experimental-speech-to-text",
    "version": "0.2.0-rc.2",
    "description": "Experimental speech recognition with independently selectable providers",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-speech-to-text-sensevoice",
    "name": "@deepseek-ai/dsh-experimental-speech-to-text-sensevoice",
    "version": "0.2.0-rc.2",
    "description": "Local SenseVoice ONNX transcription with a managed sherpa-onnx process",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-experimental-voice-input-bundle",
    "name": "@deepseek-ai/dsh-experimental-voice-input-bundle",
    "version": "0.2.0-rc.2",
    "description": "Experimental voice input with local SenseVoice; downloads its runtime on first use",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-file-reference",
    "name": "@deepseek-ai/dsh-file-reference",
    "version": "0.2.0-rc.2",
    "description": "File-reference discovery contract and shared @file grammar",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-file-reference-local",
    "name": "@deepseek-ai/dsh-file-reference-local",
    "version": "0.2.0-rc.2",
    "description": "Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-goal-round-driver",
    "name": "@deepseek-ai/dsh-goal-round-driver",
    "version": "0.2.0-rc.2",
    "description": "Race-fenced same-session goal-round driver",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-headless",
    "name": "@deepseek-ai/dsh-headless",
    "version": "0.2.0-rc.2",
    "description": "The dsh one-shot bundle: a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-hmr",
    "name": "@deepseek-ai/dsh-hmr",
    "version": "0.2.0-rc.2",
    "description": "Coordinated module and profile configuration hot reload",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-home-paths",
    "name": "@deepseek-ai/dsh-home-paths",
    "version": "0.2.0-rc.2",
    "description": "Shared filesystem path helpers for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-hook-protocol",
    "name": "@deepseek-ai/dsh-hook-protocol",
    "version": "0.2.0-rc.2",
    "description": "Shared Claude Code / Codex hook wire protocol: matcher engine, stdin/exit-code/stdout codec, multi-hook merge, and hook/* session events",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-hooks-claude-code",
    "name": "@deepseek-ai/dsh-hooks-claude-code",
    "version": "0.2.0-rc.2",
    "description": "Bridge plugin: run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-hooks-codex",
    "name": "@deepseek-ai/dsh-hooks-codex",
    "version": "0.2.0-rc.2",
    "description": "Bridge plugin: run a Codex hooks.json hook config on the DeepSeek Harness interception seams",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-directory-picker",
    "name": "@deepseek-ai/dsh-host-directory-picker",
    "version": "0.2.0-rc.2",
    "description": "Abstract workspace-directory picking seam (ctx.directoryPicker) for the DeepSeek Harness web GUI host",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-directory-picker-auto",
    "name": "@deepseek-ai/dsh-host-directory-picker-auto",
    "version": "0.2.0-rc.2",
    "description": "Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the DeepSeek Harness web GUI host",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-directory-picker-browse",
    "name": "@deepseek-ai/dsh-host-directory-picker-browse",
    "version": "0.2.0-rc.2",
    "description": "In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-directory-picker-native",
    "name": "@deepseek-ai/dsh-host-directory-picker-native",
    "version": "0.2.0-rc.2",
    "description": "Native-OS-chooser backend of the directory-picker seam for the DeepSeek Harness web GUI host",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-frontend-static",
    "name": "@deepseek-ai/dsh-host-frontend-static",
    "version": "0.2.0-rc.2",
    "description": "SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-open-in-app",
    "name": "@deepseek-ai/dsh-host-open-in-app",
    "version": "0.2.0-rc.2",
    "description": "Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-plugin-inventory",
    "name": "@deepseek-ai/dsh-host-plugin-inventory",
    "version": "0.2.0-rc.2",
    "description": "Read-only Remote projection of current Cordis Loader plugin state",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-product-telemetry-otel",
    "name": "@deepseek-ai/dsh-host-product-telemetry-otel",
    "version": "0.2.0-rc.2",
    "description": "Explicit product usage events exported through OpenTelemetry HTTP logs",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-host-webserver",
    "name": "@deepseek-ai/dsh-host-webserver",
    "version": "0.2.0-rc.2",
    "description": "Web route-registration plugin: HTTP and upgrade routes, index transform taps, and static dist fallback; knows no harness concepts",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-http-proxy",
    "name": "@deepseek-ai/dsh-http-proxy",
    "version": "0.2.0-rc.2",
    "description": "Process-wide outbound HTTP proxy policy for DeepSeek Harness: resolve it from the launch environment and install it as undici's global dispatcher",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-invariants",
    "name": "@deepseek-ai/dsh-invariants",
    "version": "0.2.0-rc.2",
    "description": "Registry service for package-owned DeepSeek Harness runtime invariants",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-jobs",
    "name": "@deepseek-ai/dsh-jobs",
    "version": "0.2.0-rc.2",
    "description": "Background job registry (ctx.jobs) for the DeepSeek Harness — shared ids, owner isolation, polling, cancellation, and completion listeners for long-running tool work",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-jobs-local",
    "name": "@deepseek-ai/dsh-jobs-local",
    "version": "0.2.0-rc.2",
    "description": "Process-local implementation of the DeepSeek Harness background job registry seam",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-launch-environment",
    "name": "@deepseek-ai/dsh-launch-environment",
    "version": "0.2.0-rc.2",
    "description": "Immutable DeepSeek Harness launch environment that records which layer supplied each value",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-lazy-require",
    "name": "@deepseek-ai/dsh-lazy-require",
    "version": "0.2.0-rc.2",
    "description": "Caller-relative, success-cached lazy loading for CommonJS-compatible Host dependencies",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-llm",
    "name": "@deepseek-ai/dsh-llm",
    "version": "0.2.0-rc.2",
    "description": "Provider-neutral LLM service interface for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-llm-deepseek",
    "name": "@deepseek-ai/dsh-llm-deepseek",
    "version": "0.2.0-rc.2",
    "description": "DeepSeek Messages adapter",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-llm-deepseek-account",
    "name": "@deepseek-ai/dsh-llm-deepseek-account",
    "version": "0.2.0-rc.2",
    "description": "DeepSeek account provider authentication and discovery",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-llm-deepseek-api-key",
    "name": "@deepseek-ai/dsh-llm-deepseek-api-key",
    "version": "0.2.0-rc.2",
    "description": "DeepSeek api-key provider authentication and discovery",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-llm-pi-ai",
    "name": "@deepseek-ai/dsh-llm-pi-ai",
    "version": "0.2.0-rc.2",
    "description": "pi-ai-backed DeepSeek adapter for the DeepSeek Harness LLM seam (design-verification twin of dsh-llm-deepseek)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-llm-retry",
    "name": "@deepseek-ai/dsh-llm-retry",
    "version": "0.2.0-rc.2",
    "description": "Provider-routed LLM request retry policy for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-mcp-client",
    "name": "@deepseek-ai/dsh-mcp-client",
    "version": "0.2.0-rc.2",
    "description": "MCP client bridge: connects to MCP servers and registers their tools on ctx.tools",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-mcp-resources",
    "name": "@deepseek-ai/dsh-mcp-resources",
    "version": "0.2.0-rc.2",
    "description": "Scoped MCP resource discovery and reading through shared model tools",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-message-feedback",
    "name": "@deepseek-ai/dsh-message-feedback",
    "version": "0.2.0-rc.2",
    "description": "Canonical Session-log ratings and notes for finalized assistant messages",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-native-command",
    "name": "@deepseek-ai/dsh-native-command",
    "version": "0.2.0-rc.2",
    "description": "Host-native command and path-opening utilities with shell-free execution, cancellation, desktop detection, and WSL handoff",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-office-to-pdf",
    "name": "@deepseek-ai/dsh-office-to-pdf",
    "version": "0.2.0-rc.2",
    "description": "Shared Office-to-PDF conversion with bounded queues and caching",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-otel",
    "name": "@deepseek-ai/dsh-otel",
    "version": "0.2.0-rc.2",
    "description": "Cordis service for independent ordinary-event and byte-bounded Session-log OTLP channels",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-output-retention",
    "name": "@deepseek-ai/dsh-output-retention",
    "version": "0.2.0-rc.2",
    "description": "Zero-dependency bounded-retention primitive: ItemRetainer/TextRetainer + neutral notice helpers (what did we keep, what did we omit)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-package-manifest",
    "name": "@deepseek-ai/dsh-package-manifest",
    "version": "0.2.0-rc.2",
    "description": "Shared type declarations for package.json.dsh configuration fields",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-permission-presets",
    "name": "@deepseek-ai/dsh-permission-presets",
    "version": "0.2.0-rc.2",
    "description": "User-facing permission presets (ctx.permissionPresets) for the DeepSeek Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-persona",
    "name": "@deepseek-ai/dsh-persona",
    "version": "0.2.0-rc.2",
    "description": "Composition-authored deployment persona section for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-plan-mode",
    "name": "@deepseek-ai/dsh-plan-mode",
    "version": "0.2.0-rc.2",
    "description": "Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-plugin-manager",
    "name": "@deepseek-ai/dsh-plugin-manager",
    "version": "0.2.0-rc.2",
    "description": "Current-profile plugin and bundle management shared by dsh CLI, Web and agent tools",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-plugin-package-inventory-deepseek",
    "name": "@deepseek-ai/dsh-plugin-package-inventory-deepseek",
    "version": "0.2.0-rc.2",
    "description": "Active Loader-backed plugin package inventory for official DeepSeek LLM API requests",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-ptc-runtime",
    "name": "@deepseek-ai/dsh-ptc-runtime",
    "version": "0.2.0-rc.2",
    "description": "Abstract PTC execution seam (ctx.ptcRuntime) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-ptc-runtime-node",
    "name": "@deepseek-ai/dsh-ptc-runtime-node",
    "version": "0.2.0-rc.2",
    "description": "Sandboxed Node process implementation of the DeepSeek Harness PTC execution capability",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-pwsh-local",
    "name": "@deepseek-ai/dsh-pwsh-local",
    "version": "0.2.0-rc.2",
    "description": "Local PowerShell implementation of the DeepSeek Harness bash executor seam",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-pwsh-sandbox",
    "name": "@deepseek-ai/dsh-pwsh-sandbox",
    "version": "0.2.0-rc.2",
    "description": "Sandbox-consuming implementation of the DeepSeek Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-repeat-tool-reminder",
    "name": "@deepseek-ai/dsh-repeat-tool-reminder",
    "version": "0.2.0-rc.2",
    "description": "Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sandbox",
    "name": "@deepseek-ai/dsh-sandbox",
    "version": "0.2.0-rc.2",
    "description": "Abstract process-sandbox seam (ctx.sandbox) for the DeepSeek Harness: same-world confinement vocabulary and the SandboxProvider contract",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sandbox-local",
    "name": "@deepseek-ai/dsh-sandbox-local",
    "version": "0.2.0-rc.2",
    "description": "Local process-sandbox backends for the DeepSeek Harness sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sandbox-policy",
    "name": "@deepseek-ai/dsh-sandbox-policy",
    "version": "0.2.0-rc.2",
    "description": "Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sandbox-windows-acl",
    "name": "@deepseek-ai/dsh-sandbox-windows-acl",
    "version": "0.2.0-rc.2",
    "description": "Windows ACL write-restriction sandbox backend (restricted-token spawn with capability-SID write allowlist) for the DeepSeek Harness sandbox seam",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-schedule",
    "name": "@deepseek-ai/dsh-schedule",
    "version": "0.2.0-rc.2",
    "description": "Host-wide durable reminders with shared management and original-Session delivery",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-scope",
    "name": "@deepseek-ai/dsh-scope",
    "version": "0.2.0-rc.2",
    "description": "Scoped-context registration primitive (scope tags, scope-filtered event dispatch) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sdk-app",
    "name": "@deepseek-ai/dsh-sdk-app",
    "version": "0.2.0-rc.2",
    "description": "The dsh SDK profile bundle: stdio JSON-RPC serving and process lifecycle over dsh-base",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sdk-jsonrpc-server",
    "name": "@deepseek-ai/dsh-sdk-jsonrpc-server",
    "version": "0.2.0-rc.2",
    "description": "Stdio JSON-RPC server plugin for out-of-process DeepSeek Harness SDK clients",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sdk-minimal",
    "name": "@deepseek-ai/dsh-sdk-minimal",
    "version": "0.2.0-rc.2",
    "description": "The standalone minimal SDK profile bundle: JSON-RPC, one DeepSeek adapter, persistent shell, and JSONL sessions",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-sdk-protocol",
    "name": "@deepseek-ai/dsh-sdk-protocol",
    "version": "0.2.0-rc.2",
    "description": "Shared wire protocol for the DeepSeek Harness SDK runtime: the newline-delimited JSON-RPC stdio transport and the named request, result, and notification types spoken between the runtime server and SDK clients",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session",
    "name": "@deepseek-ai/dsh-session",
    "version": "0.2.0-rc.2",
    "description": "Event-sourced session store for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-checkpoint-policy",
    "name": "@deepseek-ai/dsh-session-checkpoint-policy",
    "version": "0.2.0-rc.2",
    "description": "Semantic session durability checkpoints before model requests and tool side effects",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-format",
    "name": "@deepseek-ai/dsh-session-format",
    "version": "0.2.0-rc.2",
    "description": "Streaming adjacent Session format migration machinery",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-format-catalog",
    "name": "@deepseek-ai/dsh-session-format-catalog",
    "version": "0.2.0-rc.2",
    "description": "Build-static first-party Session format codec and migration catalog",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-format-v0-to-v1",
    "name": "@deepseek-ai/dsh-session-format-v0-to-v1",
    "version": "0.2.0-rc.2",
    "description": "Frozen released-v0 Session codec and identity migration to v1",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-format-v1-to-v2",
    "name": "@deepseek-ai/dsh-session-format-v1-to-v2",
    "version": "0.2.0-rc.2",
    "description": "Frozen released-v1 Session codec and assistant-stream migration to v2",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-format-v2-to-v3",
    "name": "@deepseek-ai/dsh-session-format-v2-to-v3",
    "version": "0.2.0-rc.2",
    "description": "Streaming system-prompt, canonical-envelope and PTC migration into V3",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-format-v3-to-v4",
    "name": "@deepseek-ai/dsh-session-format-v3-to-v4",
    "version": "0.2.0-rc.2",
    "description": "Streaming tool-role migration and delivery validation from Session V3 to V4",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-log-deepseek",
    "name": "@deepseek-ai/dsh-session-log-deepseek",
    "version": "0.2.0-rc.2",
    "description": "Incremental lossless session-log request extension for the official DeepSeek LLM API",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-log-export",
    "name": "@deepseek-ai/dsh-session-log-export",
    "version": "0.2.0-rc.2",
    "description": "Web Session-log export command and shared download dialog",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-persistence",
    "name": "@deepseek-ai/dsh-session-persistence",
    "version": "0.2.0-rc.2",
    "description": "Abstract durable session persistence seam (ctx.sessionPersistence) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-persistence-jsonl",
    "name": "@deepseek-ai/dsh-session-persistence-jsonl",
    "version": "0.2.0-rc.2",
    "description": "JSONL durable session persistence backend for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-projection",
    "name": "@deepseek-ai/dsh-session-projection",
    "version": "0.2.0-rc.2",
    "description": "Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-projection-cache",
    "name": "@deepseek-ai/dsh-session-projection-cache",
    "version": "0.2.0-rc.2",
    "description": "Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-query",
    "name": "@deepseek-ai/dsh-session-query",
    "version": "0.2.0-rc.2",
    "description": "Combined session query service contract with concrete reads, traces, and filters",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-query-sqlite",
    "name": "@deepseek-ai/dsh-session-query-sqlite",
    "version": "0.2.0-rc.2",
    "description": "Concrete ctx.sessionQuery backend with SQLite FTS5 search",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-reference",
    "name": "@deepseek-ai/dsh-session-reference",
    "version": "0.2.0-rc.2",
    "description": "Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver)",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-stats",
    "name": "@deepseek-ai/dsh-session-stats",
    "version": "0.2.0-rc.2",
    "description": "Whole-log conversation counts and wall times projection (sessionStats) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-telemetry",
    "name": "@deepseek-ai/dsh-session-telemetry",
    "version": "0.2.0-rc.2",
    "description": "SessionTelemetryBackend seam for the DeepSeek Harness: session-event capture, projection, redaction, and handoff to a reporting backend",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-telemetry-otel",
    "name": "@deepseek-ai/dsh-session-telemetry-otel",
    "version": "0.2.0-rc.2",
    "description": "Feedback-authorized Session logs over byte-bounded OpenTelemetry HTTP requests",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-title",
    "name": "@deepseek-ai/dsh-session-title",
    "version": "0.2.0-rc.2",
    "description": "Log-backed session title service and provider registry for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-title-first-prompt-llm",
    "name": "@deepseek-ai/dsh-session-title-first-prompt-llm",
    "version": "0.2.0-rc.2",
    "description": "First-message LLM provider plugin for DeepSeek Harness session titles",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-title-llm",
    "name": "@deepseek-ai/dsh-session-title-llm",
    "version": "0.2.0-rc.2",
    "description": "Shared LLM generation policy for DeepSeek Harness session-title providers",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-session-turn-outline",
    "name": "@deepseek-ai/dsh-session-turn-outline",
    "version": "0.2.0-rc.2",
    "description": "Whole-log turn outline projection (turnOutline) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-settings",
    "name": "@deepseek-ai/dsh-settings",
    "version": "0.2.0-rc.2",
    "description": "Abstract user-settings seam (ctx.settings) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-shell",
    "name": "@deepseek-ai/dsh-shell",
    "version": "0.2.0-rc.2",
    "description": "Abstract bash executor seam (ctx.shell) for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-shell-env",
    "name": "@deepseek-ai/dsh-shell-env",
    "version": "0.2.0-rc.2",
    "description": "Tool-independent managed DSH_* shell environment registry",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-skill",
    "name": "@deepseek-ai/dsh-skill",
    "version": "0.2.0-rc.2",
    "description": "Agent skill provider registry for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-skill-badge",
    "name": "@deepseek-ai/dsh-skill-badge",
    "version": "0.2.0-rc.2",
    "description": "Bundled dsh badge skill provider for DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-skill-filesystem",
    "name": "@deepseek-ai/dsh-skill-filesystem",
    "version": "0.2.0-rc.2",
    "description": "Local filesystem skill provider for the DeepSeek Harness",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-skill-office",
    "name": "@deepseek-ai/dsh-skill-office",
    "version": "0.2.0-rc.2",
    "description": "Bundled Word, PowerPoint, and Excel workflows and structural checks",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-spill",
    "name": "@deepseek-ai/dsh-spill",
    "version": "0.2.0-rc.2",
    "description": "Abstract spill storage seam (ctx.spillStore) for the DeepSeek Harness — save oversized tool text and return a retrieval locator",
    "status": "active",
    "category": "global"
  },
  {
    "id": "dsh-spill-local",
    "name": "@deepseek-ai/dsh-spill-local",
    "version": "0.2.0-rc.2",
    "description": "Local-filesystem implementation of the DeepSeek Harness spill storage seam (private session-scoped files)",
    "status": "active",
    "category": "global"
  }
];

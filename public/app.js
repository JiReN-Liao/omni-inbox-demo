/* =========================================================================
   Omni Inbox - front-end controller
   Vanilla JS, no build step. Talks to the existing Express API only.
   ========================================================================= */

let currentUser = localStorage.getItem("lineUnifiedUser") || "admin";
let currentLanguage = localStorage.getItem("lineUnifiedLanguage") || "zh";
let currentConversationId = null;
let users = [];
let accounts = [];
let filters = { status: "all", accountId: "all", query: "" };
let sortMode = "recent";
let clientFilter = null; // { key, fn } applied client-side on top of API filters
let currentConversations = [];
let activeConversation = null;
let focusedIndex = -1;
let liveSource = null;       // EventSource for realtime updates
let liveTimer = null;        // debounce for coalescing refresh signals
let lastConnection = null;
let activeConnectorPlatform = "line";

/* =============================== i18n =============================== */
const i18n = {
  zh: {
    brandSubtitle: "跨平台社群客服控制台",
    workspace: "工作區",
    workspaceName: "客服維運中心",
    workspaceOnline: "上線中",
    oaSectionLabel: "已連接平台",
    inbox: "收件匣",
    accounts: "帳號設定",
    access: "權限管理",
    globalSearch: "搜尋對話或執行指令…",
    language: "語言",
    user: "使用者",
    languageHint: "介面語言",
    userHint: "目前身份",
    zhLanguage: "繁體中文",
    enLanguage: "英文",
    zhLanguageMeta: "繁體中文",
    enLanguageMeta: "英文",
    notifications: "通知",
    storyMode: "示範導覽",
    focusMode: "聚焦模式",
    exitFocusMode: "離開聚焦",
    refresh: "重新整理",
    ready: "系統就緒",
    offline: "連線中斷，請檢查網路",
    backOnline: "已重新連線",
    newInbound: "收到新客戶訊息",

    liveStatus: "即時客服中樞",
    inboxTitle: "統一客服收件匣",
    inboxSubtitle: "集中管理 LINE、Messenger 與 Instagram 對話，統一指派負責人並追蹤服務時限。",
    searchPlaceholder: "搜尋對話、訊息或標籤",
    allAccounts: "全部帳號",
    allStatuses: "全部狀態",
    open: "待處理",
    pending: "待回覆",
    resolved: "已結案",
    sortRecent: "依最近更新",
    sortWait: "依等待時間",
    sortPriority: "依優先度",
    visibleAccounts: "可見帳號",
    totalConversations: "全部對話",
    noConversation: "目前沒有符合條件的對話。",
    loadError: "載入失敗，請重試。",
    retry: "重新載入",
    selectConversation: "選擇一則對話",
    selectConversationHint: "從左側清單挑選對話即可開始處理。",
    unassigned: "未指派",
    send: "發送",
    messagePlaceholder: "輸入回覆訊息…",
    quickReplies: "快速回覆",
    qr1: "您好，很高興為您服務，請問需要什麼協助呢？",
    qr2: "感謝您的耐心等候，我們正在為您查詢，稍候馬上回覆。",
    qr3: "已為您處理完成，請問還有其他需要協助的地方嗎？",
    contextToggle: "顯示／隱藏客戶資訊面板",
    conversationListAria: "對話清單",
    primaryNavAria: "主要導覽",
    conversationRegionAria: "對話清單區",
    threadRegionAria: "對話內容區",
    contextRegionAria: "客戶資訊區",

    triageTitle: "智能分流",
    triageSubtitle: "依狀態、負責人與等待時間快速定位",
    handoffTitle: "交接摘要",
    handoffSubtitle: "整理客戶背景、備註與處理紀錄",
    insightTitle: "營運洞察",
    insightSubtitle: "即時掌握帳號、對話與待處理量",

    inbound: "客戶訊息",
    outbound: "客服回覆",
    received: "已收到",
    sent: "已送出",
    failed: "發送失敗",
    justNow: "剛剛",
    minutesAgo: "分鐘前",
    hoursAgo: "小時前",
    daysAgo: "天前",
    waitPrefix: "等待",
    minutesUnit: "分",
    hoursUnit: "小時",
    systemCreated: "客戶已開啟對話",
    dateToday: "今天",
    dateYesterday: "昨天",

    ctxCustomer: "客戶資訊",
    ctxProperties: "對話屬性",
    statusField: "狀態",
    priorityField: "優先度",
    assigneeField: "負責人",
    tagsField: "標籤",
    tagsPlaceholder: "標籤，用逗號分隔",
    save: "儲存變更",
    priority: "優先度",
    priorityLow: "低",
    priorityNormal: "一般",
    priorityHigh: "高",
    ctxSummaryTitle: "智慧摘要",
    ctxHandoffTitle: "交接歷史",
    internalNotes: "內部備註",
    noNotes: "尚無備註。",
    notePlaceholder: "新增內部備註…",
    add: "加入",
    summaryFrom: "來自",
    summaryStatusLabel: "目前狀態",
    summaryLastLabel: "最後訊息",
    summaryTagsLabel: "標籤",
    summaryNone: "無",
    summaryAdviceOpen: "建議：盡快回覆並確認客戶需求。",
    summaryAdvicePending: "建議：追蹤查詢結果，主動回報進度。",
    summaryAdviceResolved: "建議：對話已結案，可持續追蹤滿意度。",
    handoffCreated: "對話建立",
    handoffAssigned: "指派負責人",
    handoffNote: "內部備註",
    copyHandoff: "複製交接摘要",
    copied: "交接摘要已複製到剪貼簿",
    copyFailed: "複製失敗，請手動選取",

    drawerTriageKicker: "智能分流",
    drawerTriageTitle: "選擇分流條件",
    drawerHandoffKicker: "交接摘要",
    drawerHandoffTitle: "對話交接重點",
    drawerInsightKicker: "營運洞察",
    drawerInsightTitle: "即時營運概況",
    close: "關閉",
    triageMine: "我的待處理",
    triageMineSub: "指派給我且尚未結案",
    triageUnassigned: "未指派對話",
    triageUnassignedSub: "尚未指定負責人",
    triageHigh: "高優先對話",
    triageHighSub: "標記為高優先度",
    triageWaiting: "久候未回",
    triageWaitingSub: "客戶最後發言、等待回覆中",
    insightByAccount: "各帳號分佈",
    insightOverall: "整體狀態",
    insightEmpty: "目前沒有可顯示的資料。",
    handoffNoConversation: "請先從收件匣選擇一則對話。",
    handoffSummaryTitle: "交接摘要草稿",
    itemsUnit: "則",

    paletteAria: "命令選單",
    palettePlaceholder: "輸入指令或搜尋對話…",
    paletteNavHint: "切換",
    paletteRunHint: "執行",
    paletteEmpty: "找不到符合的指令或對話。",
    groupNav: "前往",
    groupActions: "操作",
    groupSwitch: "切換",
    groupConversations: "對話",
    cmdToggleFocus: "切換聚焦模式",
    cmdToggleContext: "切換客戶資訊面板",
    cmdStory: "播放示範導覽",
    cmdRefresh: "重新整理資料",
    cmdLang: "切換語言：",
    cmdUser: "切換身份：",
    cmdAssign: "指派給：",
    cmdStatus: "標記為：",
    cmdGoInbox: "前往收件匣",
    cmdGoAccounts: "前往帳號設定",
    cmdGoAccess: "前往權限管理",

    statusUpdated: "對話已更新",
    noteAdded: "內部備註已加入",
    messageSent: "訊息已送出",
    accountSaved: "平台帳號已完成串接",
    accessUpdated: "權限已更新",
    testMessageCreated: "已建立測試訊息",
    assignedTo: "已指派給",
    statusSetTo: "狀態已更新為",
    commandReady: "已開啟",
    filterApplied: "已套用分流",
    langSwitched: "已切換語言",

    accountsTitle: "平台串接中心",
    accountsSubtitle: "管理 LINE、Messenger 與 Instagram 連接器，集中取得回呼網址與驗證狀態。",
    connectTitle: "快速串接訊息平台",
    lineMessagingApiLabel: "LINE 訊息介面",
    connectSubtitle: "貼上頻道密鑰與頻道存取權杖，系統會驗證權杖並自動讀取 LINE 帳號資料。",
    openLineConsole: "取得 LINE 憑證",
    channelSecretLabel: "頻道密鑰",
    channelTokenLabel: "頻道存取權杖",
    connectLine: "驗證並串接",
    connectedAccountsTitle: "已串接帳號",
    connectedCount: "個帳號",
    connectionVerified: "LINE 存取權杖驗證成功",
    connectionDemo: "示範模式已完成串接",
    webhookLabel: "平台回呼網址",
    copyWebhook: "複製回呼網址",
    webhookCopied: "回呼網址已複製",
    webhookHttpsRequired: "目前是本機網址；正式接收平台訊息前，請先部署至 HTTPS 網址。",
    webhookReady: "此 HTTPS 回呼網址已可填入對應平台的開發者主控台。",
    verifiedAccount: "憑證已驗證",
    connectorTabsAria: "選擇訊息平台",
    connectorKicker: "訊息連接器",
    metaConnectSubtitle: "貼上 Meta 應用程式密鑰、頁面存取權杖與帳號識別碼，系統會驗證後自動匯入帳號。",
    metaAppSecretLabel: "Meta 應用程式密鑰",
    metaTokenLabel: "Meta 頁面存取權杖",
    metaAccountIdLabel: "頁面或 Instagram 帳號識別碼",
    metaAccountIdPlaceholder: "輸入 Meta 帳號識別碼",
    openMetaConsole: "取得 Meta 憑證",
    platformVerified: "平台帳號驗證成功",
    verifyTokenLabel: "回呼驗證權杖",
    storageSafeTitle: "資料已安全保存",
    storageSafeDetail: "SQLite 完整性正常 · {snapshots} 個版本快照 · {backups} 份校驗備份",
    storageRecovered: "系統已從最近的有效備份自動復原",
    accountIdPlaceholder: "帳號識別碼，例如 oa_store",
    accountNamePlaceholder: "顯示名稱",
    channelSecretPlaceholder: "頻道密鑰",
    channelTokenPlaceholder: "頻道存取權杖",
    saveAccount: "驗證並串接",
    testInbound: "測試收訊",
    token: "存取權杖",
    secret: "密鑰",
    ok: "已設定",
    missing: "未設定",
    accessTitle: "權限管理",
    accessSubtitle: "客服人員只會看到被授權的平台帳號與相關對話。",
    adminRole: "管理員",
    agentRole: "客服人員",
    allAccess: "可檢視所有帳號",
    limitedAccess: "僅限授權帳號",
    userSource: "個人",
    groupSource: "群組",
    roomSource: "聊天室",
    notifTitle: "最新動態",
    notifEmpty: "目前沒有新的動態。",
    sampleSummary: "訂單查詢",

    storyPrev: "上一步",
    storyNext: "下一步",
    storyDone: "完成導覽",
    storyStepLabel: "步驟",
    story1Title: "新訊息進站",
    story1Text: "客戶透過 LINE、Messenger 或 Instagram 傳來新訊息，統一收件匣即時集中顯示。",
    story2Title: "智能分流",
    story2Text: "依狀態、負責人與等待時間快速分流，第一時間定位最需要處理的對話。",
    story3Title: "指派客服",
    story3Text: "將對話指派給適合的客服人員，責任歸屬清楚，交接不再混亂。",
    story4Title: "生成摘要",
    story4Text: "系統自動整理客戶背景與對話重點，交接零落差、上手零等待。",
    networkError: "目前無法連線至服務，請稍後再試。",
    unexpectedError: "發生未預期的錯誤，請重新操作。",
    story5Title: "即時回覆",
    story5Text: "使用快速回覆或自訂訊息立即回應客戶，並即時更新處理狀態。",
    story6Title: "標記結案",
    story6Text: "完成後將對話標記為已結案，營運洞察與統計同步更新。"
  },
  en: {
    brandSubtitle: "Omnichannel social support",
    workspace: "Workspace",
    workspaceName: "Support Ops",
    workspaceOnline: "Online",
    oaSectionLabel: "Connected platforms",
    inbox: "Inbox",
    accounts: "Accounts",
    access: "Access",
    globalSearch: "Search conversations or run a command…",
    language: "Language",
    user: "User",
    languageHint: "Interface language",
    userHint: "Current identity",
    zhLanguage: "Traditional Chinese",
    enLanguage: "English",
    zhLanguageMeta: "Traditional Chinese",
    enLanguageMeta: "English",
    notifications: "Notifications",
    storyMode: "Guided demo",
    focusMode: "Focus mode",
    exitFocusMode: "Exit focus",
    refresh: "Refresh",
    ready: "System ready",
    offline: "Connection lost — check your network",
    backOnline: "Back online",
    newInbound: "New customer message",

    liveStatus: "Live support command center",
    inboxTitle: "Unified Support Inbox",
    inboxSubtitle: "Manage LINE, Messenger, and Instagram conversations, assign owners, and track service levels in one place.",
    searchPlaceholder: "Search conversations, messages, or tags",
    allAccounts: "All accounts",
    allStatuses: "All statuses",
    open: "Open",
    pending: "Pending",
    resolved: "Resolved",
    sortRecent: "Most recent",
    sortWait: "Longest wait",
    sortPriority: "By priority",
    visibleAccounts: "Visible accounts",
    totalConversations: "Total conversations",
    noConversation: "No conversations match the current filters.",
    loadError: "Failed to load. Please retry.",
    retry: "Reload",
    selectConversation: "Select a conversation",
    selectConversationHint: "Pick a conversation from the list to start.",
    unassigned: "Unassigned",
    send: "Send",
    messagePlaceholder: "Type a reply…",
    quickReplies: "Quick replies",
    qr1: "Hello! Thanks for reaching out — how can I help you today?",
    qr2: "Thanks for your patience. I'm looking into this and will get back to you shortly.",
    qr3: "All set! Is there anything else I can help you with?",
    contextToggle: "Toggle customer context panel",
    conversationListAria: "Conversation list",
    primaryNavAria: "Primary navigation",
    conversationRegionAria: "Conversation list region",
    threadRegionAria: "Conversation thread region",
    contextRegionAria: "Customer context region",

    triageTitle: "Smart triage",
    triageSubtitle: "Locate work by status, owner, and wait time",
    handoffTitle: "Handoff brief",
    handoffSubtitle: "Customer context, notes, and history in one place",
    insightTitle: "Ops insight",
    insightSubtitle: "Track accounts, workload, and open items live",

    inbound: "Inbound",
    outbound: "Outbound",
    received: "Received",
    sent: "Sent",
    failed: "Failed",
    justNow: "just now",
    minutesAgo: "m ago",
    hoursAgo: "h ago",
    daysAgo: "d ago",
    waitPrefix: "Waiting",
    minutesUnit: "m",
    hoursUnit: "h",
    systemCreated: "Customer opened the conversation",
    dateToday: "Today",
    dateYesterday: "Yesterday",

    ctxCustomer: "Customer",
    ctxProperties: "Properties",
    statusField: "Status",
    priorityField: "Priority",
    assigneeField: "Assignee",
    tagsField: "Tags",
    tagsPlaceholder: "Tags, comma separated",
    save: "Save changes",
    priority: "Priority",
    priorityLow: "Low",
    priorityNormal: "Normal",
    priorityHigh: "High",
    ctxSummaryTitle: "AI summary",
    ctxHandoffTitle: "Handoff history",
    internalNotes: "Internal notes",
    noNotes: "No notes yet.",
    notePlaceholder: "Add an internal note…",
    add: "Add",
    summaryFrom: "From",
    summaryStatusLabel: "Status",
    summaryLastLabel: "Last message",
    summaryTagsLabel: "Tags",
    summaryNone: "None",
    summaryAdviceOpen: "Suggestion: reply promptly and confirm the customer's needs.",
    summaryAdvicePending: "Suggestion: track the lookup and proactively share progress.",
    summaryAdviceResolved: "Suggestion: conversation resolved — follow up on satisfaction.",
    handoffCreated: "Conversation created",
    handoffAssigned: "Owner assigned",
    handoffNote: "Internal note",
    copyHandoff: "Copy handoff brief",
    copied: "Handoff brief copied to clipboard",
    copyFailed: "Copy failed — please select manually",

    drawerTriageKicker: "Smart triage",
    drawerTriageTitle: "Choose a triage filter",
    drawerHandoffKicker: "Handoff brief",
    drawerHandoffTitle: "Conversation handoff",
    drawerInsightKicker: "Ops insight",
    drawerInsightTitle: "Live operations overview",
    close: "Close",
    triageMine: "My open work",
    triageMineSub: "Assigned to me and not resolved",
    triageUnassigned: "Unassigned",
    triageUnassignedSub: "No owner yet",
    triageHigh: "High priority",
    triageHighSub: "Flagged as high priority",
    triageWaiting: "Awaiting reply",
    triageWaitingSub: "Customer spoke last, waiting on us",
    insightByAccount: "By account",
    insightOverall: "Overall status",
    insightEmpty: "No data to display yet.",
    handoffNoConversation: "Select a conversation from the inbox first.",
    handoffSummaryTitle: "Handoff brief draft",
    itemsUnit: "",

    paletteAria: "Command menu",
    palettePlaceholder: "Type a command or search conversations…",
    paletteNavHint: "Navigate",
    paletteRunHint: "Run",
    paletteEmpty: "No matching commands or conversations.",
    groupNav: "Go to",
    groupActions: "Actions",
    groupSwitch: "Switch",
    groupConversations: "Conversations",
    cmdToggleFocus: "Toggle focus mode",
    cmdToggleContext: "Toggle customer context panel",
    cmdStory: "Play guided demo",
    cmdRefresh: "Refresh data",
    cmdLang: "Language: ",
    cmdUser: "Switch to: ",
    cmdAssign: "Assign to: ",
    cmdStatus: "Set status: ",
    cmdGoInbox: "Go to Inbox",
    cmdGoAccounts: "Go to Accounts",
    cmdGoAccess: "Go to Access",

    statusUpdated: "Conversation updated",
    noteAdded: "Internal note added",
    messageSent: "Message sent",
    accountSaved: "LINE account connected",
    accessUpdated: "Access updated",
    testMessageCreated: "Test message created",
    assignedTo: "Assigned to",
    statusSetTo: "Status set to",
    commandReady: "Opened",
    filterApplied: "Filter applied",
    langSwitched: "Language switched",

    accountsTitle: "Platform Connections",
    accountsSubtitle: "Manage LINE, Messenger, and Instagram connectors, webhook URLs, and verification status.",
    connectTitle: "Quick connect a messaging platform",
    lineMessagingApiLabel: "LINE Messaging API",
    connectSubtitle: "Paste the Channel Secret and Channel Access Token. The app verifies them with LINE and imports the account details.",
    openLineConsole: "Get LINE credentials",
    channelSecretLabel: "Channel Secret",
    channelTokenLabel: "Channel Access Token",
    connectLine: "Verify and connect",
    connectedAccountsTitle: "Connected accounts",
    connectedCount: "accounts",
    connectionVerified: "LINE account verified",
    connectionDemo: "Demo account connected",
    webhookLabel: "Platform webhook URL",
    copyWebhook: "Copy webhook URL",
    webhookCopied: "Webhook URL copied",
    webhookHttpsRequired: "This is a local URL. Deploy to HTTPS before receiving platform messages.",
    webhookReady: "This HTTPS webhook URL is ready for the platform developer console.",
    verifiedAccount: "Credentials verified",
    connectorTabsAria: "Choose a messaging platform",
    connectorKicker: "Messaging connector",
    metaConnectSubtitle: "Paste the Meta App Secret, Page Access Token, and account ID. The app verifies and imports the account.",
    metaAppSecretLabel: "Meta App Secret",
    metaTokenLabel: "Meta Page Access Token",
    metaAccountIdLabel: "Page or Instagram account ID",
    metaAccountIdPlaceholder: "Enter the Meta account ID",
    openMetaConsole: "Get Meta credentials",
    platformVerified: "Platform account verified",
    verifyTokenLabel: "Webhook verify token",
    storageSafeTitle: "Data is durably stored",
    storageSafeDetail: "SQLite integrity verified · {snapshots} version snapshots · {backups} checked backups",
    storageRecovered: "The latest valid backup was restored automatically",
    accountIdPlaceholder: "account id, e.g. oa_store",
    accountNamePlaceholder: "Display name",
    channelSecretPlaceholder: "Channel secret",
    channelTokenPlaceholder: "Channel access token",
    saveAccount: "Verify and connect",
    testInbound: "Test inbound",
    token: "Token",
    secret: "Secret",
    ok: "set",
    missing: "missing",
    accessTitle: "Access",
    accessSubtitle: "Agents only see conversations from authorized platform accounts.",
    adminRole: "Admin",
    agentRole: "Agent",
    allAccess: "Can view every account",
    limitedAccess: "Authorized accounts only",
    userSource: "User",
    groupSource: "Group",
    roomSource: "Room",
    notifTitle: "Latest activity",
    notifEmpty: "No new activity.",
    sampleSummary: "Order lookup",

    storyPrev: "Back",
    storyNext: "Next",
    storyDone: "Finish",
    storyStepLabel: "Step",
    story1Title: "New message arrives",
    story1Text: "A customer messages a LINE Official Account; the unified inbox surfaces it instantly so nothing slips through.",
    story2Title: "Smart triage",
    story2Text: "Triage by status, owner, and wait time to find the most urgent conversation first.",
    story3Title: "Assign an agent",
    story3Text: "Route the conversation to the right agent — clear ownership, clean handoffs.",
    story4Title: "Generate a summary",
    story4Text: "AI compiles customer context and key points, so handoffs lose nothing.",
    story5Title: "Reply instantly",
    story5Text: "Use a quick reply or a custom message to respond, and update the status live.",
    story6Title: "Resolve",
    story6Text: "Mark the conversation resolved when done — insight and stats update in sync.",
    networkError: "Unable to connect to the service. Please try again.",
    unexpectedError: "Something unexpected happened. Please try again."
  }
};

function t(key) {
  return i18n[currentLanguage][key] ?? i18n.en[key] ?? key;
}

/* =============================== Icons (Lucide) =============================== */
const ICONS = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  focus: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  "panel-right": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "check-check": '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "circle-dot": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
};

function icon(name, cls = "") {
  const inner = ICONS[name] || "";
  return `<span class="i ${cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg></span>`;
}

function paintIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  });
}

/* =============================== Avatars =============================== */
const AVATAR_COLORS = [
  ["#06c755", "#0e9f6e"],
  ["#0ea5b7", "#2563eb"],
  ["#7c3aed", "#a855f7"],
  ["#c8810a", "#e0a106"],
  ["#e0464b", "#f4736f"],
  ["#0d9488", "#14b8a6"]
];
function hashString(value) {
  let hash = 0;
  const text = String(value || "?");
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}
function avatarColors(seed) {
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length];
}
function avatarMarkup(name, seed, size = "av-md") {
  const [a, b] = avatarColors(seed || name);
  return `<span class="avatar ${size}" style="--a:${a};--b:${b}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}
function paintAvatar(el, name, seed, size = "av-lg") {
  if (!el) return;
  const [a, b] = avatarColors(seed || name);
  el.style.setProperty("--a", a);
  el.style.setProperty("--b", b);
  el.className = `avatar ${size}`;
  el.textContent = initials(name);
}

/* =============================== Time helpers =============================== */
function relativeTime(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - then) / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return joinUnit(minutes, t("minutesAgo"));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return joinUnit(hours, t("hoursAgo"));
  const days = Math.floor(hours / 24);
  if (days < 7) return joinUnit(days, t("daysAgo"));
  return new Date(value).toLocaleDateString(localeTag());
}
function joinUnit(n, unit) {
  return currentLanguage === "zh" ? `${n} ${unit}` : `${n}${unit}`;
}
function localeTag() {
  return currentLanguage === "zh" ? "zh-Hant" : "en-US";
}
function formatTime(value) {
  return new Date(value).toLocaleString(localeTag(), { hour: "2-digit", minute: "2-digit" });
}
function dayKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(value) {
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return t("dateToday");
  if (dayKey(d) === dayKey(yesterday)) return t("dateYesterday");
  return d.toLocaleDateString(localeTag(), { month: "short", day: "numeric" });
}
function waitMinutes(conversation) {
  const last = conversation.lastMessage;
  if (!last || last.direction !== "inbound" || conversation.status === "resolved") return null;
  return Math.floor(Math.max(0, Date.now() - new Date(last.createdAt).getTime()) / 60000);
}
function waitLabel(minutes) {
  if (minutes < 60) return `${t("waitPrefix")} ${minutes}${currentLanguage === "zh" ? " " : ""}${t("minutesUnit")}`;
  const hours = Math.floor(minutes / 60);
  return `${t("waitPrefix")} ${hours}${currentLanguage === "zh" ? " " : ""}${t("hoursUnit")}`;
}

/* =============================== API =============================== */
const api = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": currentLanguage === "zh" ? "zh-TW" : "en-US",
        "x-demo-user": currentUser,
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(t("networkError"));
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const localized = currentLanguage === "zh"
      ? body.error || (response.status === 502 ? "LINE 訊息發送失敗，請稍後再試。" : t("unexpectedError"))
      : body.error || `HTTP ${response.status}`;
    throw new Error(localized);
  }
  return body;
};

/* =============================== DOM refs =============================== */
const els = {};
function cacheEls() {
  [
    "brandSubtitle", "workspaceKicker", "workspaceName", "workspaceStatus", "oaLabel", "sidebarAccounts",
    "primaryNav", "navInbox", "navAccounts", "navAccess", "status",
    "globalSearchBtn", "globalSearchLabel", "cmdKeyLabel",
    "languageMenuButton", "languageCurrent", "languageHint", "languageMenu", "languageLabel",
    "userMenuButton", "userMenuAvatar", "userCurrent", "userHint", "userMenu", "userLabel",
    "notifBtn", "notifMenu", "storyModeBtn",
    "liveStatusLabel", "inboxTitle", "inboxSubtitle", "focusModeBtn", "refreshBtn",
    "stats", "triageTitle", "triageSubtitle", "handoffTitle", "handoffSubtitle", "insightTitle", "insightSubtitle",
    "conversationRegion", "searchInput", "accountFilter", "statusFilter", "sortFilter", "conversationList",
    "threadRegion", "threadAvatar", "threadTitle", "threadMeta", "contextToggleBtn", "messages", "quickReplies",
    "sendForm", "messageInput", "sendBtn", "contextPanel", "contextScroll",
    "accountsTitle", "accountsSubtitle", "lineMessagingApiLabel", "connectTitle", "connectSubtitle", "lineConsoleLink", "connectorTabs",
    "channelSecretLabel", "channelTokenLabel", "externalAccountField", "externalAccountLabel", "externalAccountInput", "connectionResult", "storageSafety", "connectedAccountsTitle", "connectedAccountsCount",
    "accountList", "accountForm", "accountSecretInput", "accountTokenInput", "saveAccountBtn",
    "accessTitle", "accessSubtitle", "accessList",
    "paletteOverlay", "palette", "paletteInput", "paletteList", "paletteNavHint", "paletteRunHint",
    "drawerOverlay", "drawer", "drawerKicker", "drawerTitle", "drawerCloseBtn", "drawerBody",
    "storyOverlay", "storySpotlight", "storyCard", "storyStep", "storyCloseBtn", "storyTitle", "storyText",
    "storyProgress", "storyPrevBtn", "storyNextBtn", "toastHost"
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

/* =============================== Toast / status =============================== */
function setStatus(text, tone = "ok") {
  els.status.textContent = text;
  els.status.dataset.touched = "1";
  els.status.classList.toggle("is-error", tone === "error");
  showToast(text, tone);
}
function showToast(text, tone = "ok") {
  if (!els.toastHost) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "error" ? "error" : ""}`.trim();
  toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(text)}</span>`;
  els.toastHost.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 320); }, 2600);
}

/* =============================== Boot =============================== */
async function boot() {
  cacheEls();
  paintIcons();
  applyLanguage();
  const me = await api("/api/me");
  users = me.users;
  renderLanguageMenu();
  renderUserMenu();
  wireEvents();
  await refreshAll();
  connectLiveUpdates();
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hant" : "en";
  setText("brandSubtitle", t("brandSubtitle"));
  setText("workspaceKicker", t("workspace"));
  setText("workspaceName", t("workspaceName"));
  setText("workspaceStatus", t("workspaceOnline"));
  setText("oaLabel", t("oaSectionLabel"));
  navText("navInbox", t("inbox"));
  navText("navAccounts", t("accounts"));
  navText("navAccess", t("access"));
  els.primaryNav.setAttribute("aria-label", t("primaryNavAria"));

  els.globalSearchBtn.setAttribute("aria-label", t("globalSearch"));
  setText("globalSearchLabel", t("globalSearch"));
  els.cmdKeyLabel.textContent = isMac() ? "⌘" : "Ctrl";
  els.languageMenuButton.setAttribute("aria-label", t("language"));
  els.userMenuButton.setAttribute("aria-label", t("user"));
  setText("languageHint", t("languageHint"));
  setText("userHint", t("userHint"));
  setText("languageLabel", t("language"));
  setText("userLabel", t("user"));
  els.notifBtn.setAttribute("aria-label", t("notifications"));
  btnText(els.storyModeBtn, t("storyMode"));

  setText("liveStatusLabel", t("liveStatus"));
  setText("inboxTitle", t("inboxTitle"));
  setText("inboxSubtitle", t("inboxSubtitle"));
  btnText(els.focusModeBtn, document.body.classList.contains("focus-mode") ? t("exitFocusMode") : t("focusMode"));
  btnText(els.refreshBtn, t("refresh"));

  setText("triageTitle", t("triageTitle"));
  setText("triageSubtitle", t("triageSubtitle"));
  setText("handoffTitle", t("handoffTitle"));
  setText("handoffSubtitle", t("handoffSubtitle"));
  setText("insightTitle", t("insightTitle"));
  setText("insightSubtitle", t("insightSubtitle"));

  els.searchInput.placeholder = t("searchPlaceholder");
  els.searchInput.setAttribute("aria-label", t("searchPlaceholder"));
  els.conversationList.setAttribute("aria-label", t("conversationListAria"));
  els.conversationRegion.setAttribute("aria-label", t("conversationRegionAria"));
  els.threadRegion.setAttribute("aria-label", t("threadRegionAria"));
  els.contextPanel.setAttribute("aria-label", t("contextRegionAria"));
  els.accountFilter.setAttribute("aria-label", t("allAccounts"));
  els.statusFilter.setAttribute("aria-label", t("statusField"));
  els.sortFilter.setAttribute("aria-label", t("sortRecent"));
  setStatusFilterLabels();
  setSortFilterLabels();

  els.messageInput.placeholder = t("messagePlaceholder");
  btnText(els.sendBtn, t("send"));
  els.contextToggleBtn.setAttribute("aria-label", t("contextToggle"));

  setText("accountsTitle", t("accountsTitle"));
  setText("accountsSubtitle", t("accountsSubtitle"));
  setText("connectTitle", t("connectTitle"));
  setText("connectedAccountsTitle", t("connectedAccountsTitle"));
  els.connectorTabs.setAttribute("aria-label", t("connectorTabsAria"));
  renderConnectorForm();
  if (lastConnection) renderConnectionResult(lastConnection);
  setText("accessTitle", t("accessTitle"));
  setText("accessSubtitle", t("accessSubtitle"));

  els.paletteInput.placeholder = t("palettePlaceholder");
  els.palette.setAttribute("aria-label", t("paletteAria"));
  setText("paletteNavHint", t("paletteNavHint"));
  setText("paletteRunHint", t("paletteRunHint"));
  els.drawerCloseBtn.setAttribute("aria-label", t("close"));
  els.storyCloseBtn.setAttribute("aria-label", t("close"));
  els.storyPrevBtn.textContent = t("storyPrev");

  if (!els.status.dataset.touched) els.status.textContent = t("ready");

  renderLanguageMenu();
  renderUserMenu();
  renderQuickReplies();
  if (!currentConversationId) resetThread();
}

function setText(id, text) { const el = els[id] || document.getElementById(id); if (el) el.textContent = text; }
function navText(id, text) { const el = els[id]; if (el) el.querySelector(".nav-text").textContent = text; }
function btnText(btn, text) { if (!btn) return; const s = btn.querySelector(".btn-text"); if (s) s.textContent = text; }
function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ""); }

function setStatusFilterLabels() {
  const opts = els.statusFilter.options;
  opts[0].textContent = t("allStatuses");
  opts[1].textContent = t("open");
  opts[2].textContent = t("pending");
  opts[3].textContent = t("resolved");
}
function setSortFilterLabels() {
  const opts = els.sortFilter.options;
  opts[0].textContent = t("sortRecent");
  opts[1].textContent = t("sortWait");
  opts[2].textContent = t("sortPriority");
}

/* =============================== Menus (language / user / notif) =============================== */
function renderLanguageMenu() {
  const languages = [
    { id: "zh", name: t("zhLanguage"), meta: t("zhLanguageMeta") },
    { id: "en", name: t("enLanguage"), meta: t("enLanguageMeta") }
  ];
  const active = languages.find((l) => l.id === currentLanguage) || languages[0];
  els.languageCurrent.textContent = active.name;
  els.languageMenu.innerHTML = languages
    .map((l) => menuOption({ id: l.id, title: l.name, meta: l.meta, active: l.id === currentLanguage, type: "language", icon: "languages" }))
    .join("");
  bindMenuOptions(els.languageMenu, (id) => setLanguage(id));
}

function renderUserMenu() {
  if (!users.length) return;
  const active = users.find((u) => u.id === currentUser) || users[0];
  els.userCurrent.textContent = active.name;
  paintAvatar(els.userMenuAvatar, active.name, active.id, "av-sm");
  els.userMenu.innerHTML = users
    .map((u) => menuOption({
      id: u.id, title: u.name,
      meta: u.role === "admin" ? t("allAccess") : t("limitedAccess"),
      active: u.id === currentUser, type: "user", badge: roleLabel(u.role), seed: u.id
    }))
    .join("");
  bindMenuOptions(els.userMenu, (id) => setUser(id));
}

function menuOption({ id, title, meta, active, type, badge, seed, icon: iconName }) {
  const lead = type === "user" ? avatarMarkup(title, seed || id, "av-sm") : icon(iconName || "circle-dot");
  return `<button class="menu-option ${active ? "active" : ""}" type="button" role="option" aria-selected="${active}" data-${type}-id="${id}">
    ${lead}
    <span class="menu-option-text"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span>
    ${badge ? `<em>${escapeHtml(badge)}</em>` : ""}
    ${icon("check", "check")}
  </button>`;
}

function bindMenuOptions(menu, handler) {
  menu.querySelectorAll(".menu-option").forEach((button) => {
    button.addEventListener("click", () => { closeMenus(); handler(button.dataset.languageId || button.dataset.userId); });
  });
}

function renderNotifMenu() {
  const items = currentConversations
    .filter((c) => c.lastMessage)
    .slice(0, 5)
    .map((c) => ({
      title: c.displayName,
      meta: `${c.account?.name || c.accountId} · ${truncate(c.lastMessage.text, 40)}`,
      time: relativeTime(c.lastMessage.createdAt),
      seed: c.id, id: c.id
    }));
  els.notifMenu.innerHTML = `<div class="notif-head">${t("notifTitle")}</div>` + (
    items.length
      ? items.map((it) => `<button class="notif-item" type="button" data-conv="${escapeHtml(it.id)}">
          ${avatarMarkup(it.title, it.seed, "av-sm")}
          <span><strong>${escapeHtml(it.title)}</strong><small>${escapeHtml(it.meta)}</small><span class="activity-time">${escapeHtml(it.time)}</span></span>
        </button>`).join("")
      : `<div class="palette-empty">${t("notifEmpty")}</div>`
  );
  els.notifMenu.querySelectorAll("[data-conv]").forEach((b) => {
    b.addEventListener("click", () => { closeMenus(); goView("inbox"); openConversation(b.dataset.conv); });
  });
}

/* =============================== Actions (shared by UI + palette) =============================== */
async function setLanguage(languageId) {
  if (languageId === currentLanguage) return;
  currentLanguage = languageId;
  localStorage.setItem("lineUnifiedLanguage", currentLanguage);
  applyLanguage();
  renderAccountFilter();
  renderConversationList();
  renderAccounts();
  renderAccess();
  renderNotifMenu();
  await renderStats();
  if (currentConversationId) await openConversation(currentConversationId, { silent: true });
  setStatus(t("langSwitched"));
}

async function setUser(userId) {
  currentUser = userId;
  localStorage.setItem("lineUnifiedUser", currentUser);
  currentConversationId = null;
  activeConversation = null;
  clientFilter = null;
  filters = { status: "all", accountId: "all", query: "" };
  els.searchInput.value = "";
  renderUserMenu();
  await refreshAll();
  connectLiveUpdates();
}

function goView(view) {
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const target = document.getElementById(`${view}View`);
  if (target) { target.classList.remove("hidden"); target.style.animation = "none"; requestAnimationFrame(() => { target.style.animation = ""; }); }
}

function toggleFocus() {
  document.body.classList.toggle("focus-mode");
  btnText(els.focusModeBtn, document.body.classList.contains("focus-mode") ? t("exitFocusMode") : t("focusMode"));
}
function toggleContext() {
  const hidden = document.body.classList.toggle("no-context");
  els.contextToggleBtn.setAttribute("aria-pressed", String(!hidden));
}

/* =============================== Refresh / data =============================== */
async function refreshAll() {
  try {
    const accountData = await api("/api/accounts");
    accounts = accountData.accounts;
    renderAccountFilter();
    renderSidebarAccounts();
    renderAccounts();
    await renderStorageStatus();
    renderAccess();
    await renderStats();
    await loadConversations();
    renderNotifMenu();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

/* =============================== Live updates (SSE) =============================== */
// Subscribe to the server's /api/stream channel. On each "refresh" signal the
// inbox, stats, and (if affected) the open thread re-fetch — so a new inbound
// message appears without a manual refresh. EventSource auto-reconnects.
function connectLiveUpdates() {
  if (typeof EventSource === "undefined") return;
  if (liveSource) liveSource.close();
  liveSource = new EventSource(`/api/stream?demoUser=${encodeURIComponent(currentUser)}`);
  liveSource.addEventListener("refresh", () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(liveRefresh, 300);
  });
}

async function liveRefresh() {
  if (els.storyOverlay && !els.storyOverlay.hidden) return; // don't disrupt the guided demo
  const before = new Map(currentConversations.map((c) => [c.id, c.lastMessage?.id || null]));
  await renderStats();
  await loadConversations();
  renderNotifMenu();

  let newInbound = 0;
  let openChanged = false;
  for (const c of currentConversations) {
    const changed = !before.has(c.id) || before.get(c.id) !== (c.lastMessage?.id || null);
    if (!changed) continue;
    if (c.lastMessage?.direction === "inbound") newInbound += 1;
    if (c.id === currentConversationId) openChanged = true;
  }
  if (openChanged) await openConversation(currentConversationId, { silent: true });
  if (newInbound > 0) showToast(t("newInbound"), "ok");
}

async function renderStats() {
  const data = await api("/api/stats");
  const s = data.stats;
  const items = [
    { key: "visibleAccounts", value: s.visibleAccounts, tone: "cyan", icon: "grid" },
    { key: "totalConversations", value: s.totalConversations, tone: "slate", icon: "message" },
    { key: "open", value: s.open, tone: "green", icon: "inbox" },
    { key: "pending", value: s.pending, tone: "amber", icon: "clock" },
    { key: "resolved", value: s.resolved, tone: "slate", icon: "check-check" }
  ];
  els.stats.innerHTML = items.map((it) => `<div class="stat ${it.tone}">
      <span class="stat-icon">${icon(it.icon)}</span>
      <strong data-count="${it.value}">0</strong>
      <span class="stat-label">${t(it.key)}</span>
    </div>`).join("");
  els.stats.querySelectorAll("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count)));
}
function countUp(el, target) {
  const duration = 600, start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderAccountFilter() {
  els.accountFilter.innerHTML = `<option value="all">${t("allAccounts")}</option>` +
    accounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(platformLabel(a.platform))} · ${escapeHtml(a.name)}</option>`).join("");
  els.accountFilter.value = filters.accountId;
}

function renderSidebarAccounts() {
  const counts = {};
  currentConversations.forEach((c) => { counts[c.accountId] = (counts[c.accountId] || 0) + 1; });
  els.sidebarAccounts.innerHTML = accounts.map((a) => `<button class="rail-oa ${filters.accountId === a.id ? "active" : ""}" type="button" data-account="${escapeHtml(a.id)}">
      <span class="platform-mini">${platformLogo(a.platform, "md")}</span>
      <span class="oa-name">${escapeHtml(a.name)}</span>
      <span class="oa-count">${counts[a.id] || 0}</span>
    </button>`).join("");
  els.sidebarAccounts.querySelectorAll("[data-account]").forEach((b) => {
    b.addEventListener("click", async () => {
      filters.accountId = filters.accountId === b.dataset.account ? "all" : b.dataset.account;
      els.accountFilter.value = filters.accountId;
      currentConversationId = null;
      await loadConversations();
    });
  });
}

function skeletonRows(count) {
  return Array.from({ length: count }).map(() => `<div class="skeleton">
      <div class="sk sk-av"></div>
      <div class="sk-lines"><div class="sk sk-line w70"></div><div class="sk sk-line w40"></div><div class="sk sk-line w90"></div></div>
    </div>`).join("");
}

async function loadConversations() {
  if (!currentConversations.length) els.conversationList.innerHTML = skeletonRows(5);
  try {
    const params = new URLSearchParams(filters);
    const data = await api(`/api/conversations?${params.toString()}`);
    currentConversations = data.conversations;
    renderSidebarAccounts();
    renderConversationList();
    renderNotifMenu();
  } catch (error) {
    els.conversationList.innerHTML = `<div class="empty error">${icon("alert")}<span>${escapeHtml(t("loadError"))}</span><button class="btn btn-soft" id="retryLoad" type="button">${t("retry")}</button></div>`;
    const retry = document.getElementById("retryLoad");
    if (retry) retry.addEventListener("click", loadConversations);
  }
}

function visibleConversations() {
  let list = currentConversations.slice();
  if (clientFilter) list = list.filter(clientFilter.fn);
  if (sortMode === "wait") {
    list.sort((a, b) => (waitMinutes(b) ?? -1) - (waitMinutes(a) ?? -1));
  } else if (sortMode === "priority") {
    const rank = { high: 0, normal: 1, low: 2 };
    list.sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
  }
  return list;
}

function renderConversationList() {
  const list = visibleConversations();
  if (!list.length) {
    els.conversationList.innerHTML = `<div class="empty">${icon("inbox")}<span>${escapeHtml(t("noConversation"))}</span></div>`;
    if (!currentConversationId) { activeConversation = null; resetThread(); els.messages.innerHTML = `<div class="empty">${icon("message")}<span>${escapeHtml(t("selectConversationHint"))}</span></div>`; }
    return;
  }
  els.conversationList.innerHTML = list.map((item, index) => {
    const active = item.id === currentConversationId;
    const preview = item.lastMessage?.text || "";
    const time = relativeTime(item.lastMessage?.createdAt || item.updatedAt);
    const tags = (item.tags || []).slice(0, 2).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("");
    const wait = waitMinutes(item);
    const slaClass = wait == null ? "" : wait >= 120 ? "risk" : wait >= 30 ? "warn" : "";
    const sla = wait == null || wait < 1 ? "" : `<span class="sla ${slaClass}">${icon("clock")}${escapeHtml(waitLabel(wait))}</span>`;
    const prio = item.priority === "high" ? `${icon("alert", "prio-flag")}` : "";
    const unread = item.lastMessage?.direction === "inbound" && item.status !== "resolved" ? '<span class="unread-dot" aria-hidden="true"></span>' : "";
    return `<button class="conversation ${active ? "active" : ""}" role="option" aria-selected="${active}" data-id="${escapeHtml(item.id)}" data-index="${index}">
        ${unread}
        ${avatarMarkup(item.displayName, item.id, "av-md")}
        <div class="conversation-main">
          <div class="conversation-top"><strong>${escapeHtml(item.displayName)}</strong><span class="conversation-time">${escapeHtml(time)}</span></div>
          <span class="conversation-sub"><b class="source-platform ${escapeHtml(item.account?.platform || "line")}">${platformLogo(item.account?.platform, "sm")}${escapeHtml(platformLabel(item.account?.platform))}</b>${escapeHtml(item.account?.name || item.accountId)} · ${escapeHtml(item.assignee?.name || t("unassigned"))}</span>
          <p class="conversation-preview">${escapeHtml(preview)}</p>
          <div class="conversation-foot"><span class="badge ${item.status}"><i></i>${statusLabel(item.status)}</span>${prio}${sla}${tags}</div>
        </div>
      </button>`;
  }).join("");

  els.conversationList.querySelectorAll(".conversation").forEach((button) => {
    button.addEventListener("click", () => { focusedIndex = Number(button.dataset.index); openConversation(button.dataset.id); });
  });

  if (!currentConversationId && list[0]) openConversation(list[0].id);
  else syncListActive();
}

function syncListActive() {
  els.conversationList.querySelectorAll(".conversation").forEach((b) => {
    const active = b.dataset.id === currentConversationId;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
}

/* =============================== Conversation thread =============================== */
function withTransition(update) {
  if (document.startViewTransition && !prefersReducedMotion()) document.startViewTransition(update);
  else update();
}
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function openConversation(conversationId, { silent = false } = {}) {
  currentConversationId = conversationId;
  let data;
  try {
    data = await api(`/api/conversations/${encodeURIComponent(conversationId)}`);
  } catch (error) {
    if (!silent) setStatus(error.message, "error");
    return;
  }
  const conversation = data.conversation;
  activeConversation = conversation;
  withTransition(() => {
    els.threadTitle.textContent = conversation.displayName;
    els.threadMeta.textContent = `${platformLabel(conversation.account.platform)} · ${conversation.account.name} · ${sourceTypeLabel(conversation.sourceType)} · ${conversation.sourceId}`;
    paintAvatar(els.threadAvatar, conversation.displayName, conversation.id, "av-lg");
    els.messages.innerHTML = renderMessages(conversation);
    els.messages.scrollTop = els.messages.scrollHeight;
    renderContextPanel(conversation);
    syncListActive();
  });
}

function renderMessages(conversation) {
  const first = conversation.messages[0];
  let html = first ? `<div class="sys-event">${icon("circle-dot")}<span>${escapeHtml(t("systemCreated"))} · ${escapeHtml(formatTime(first.createdAt))}</span></div>` : "";
  let lastDay = null;
  conversation.messages.forEach((message) => {
    const dk = dayKey(message.createdAt);
    if (dk !== lastDay) { html += `<div class="day-sep">${escapeHtml(dayLabel(message.createdAt))}</div>`; lastDay = dk; }
    const outbound = message.direction === "outbound";
    const seed = outbound ? `agent:${message.accountId}` : conversation.id;
    const name = outbound ? (authorName(conversation.assigneeId) || conversation.account.name) : conversation.displayName;
    const tick = outbound ? `<span class="tick ${message.status === "failed" ? "failed" : ""}">${message.status === "failed" ? "✕" : "✓"}</span>` : "";
    html += `<div class="msg ${message.direction}">
        ${avatarMarkup(name, seed, "av-sm")}
        <div class="msg-body">
          <div class="bubble">${escapeHtml(message.text)}</div>
          <small class="msg-meta">${tick}${directionLabel(message.direction)} · ${messageStatusLabel(message.status)} · ${escapeHtml(formatTime(message.createdAt))}</small>
        </div>
      </div>`;
  });
  return html;
}

function showTypingBubble() {
  const me = users.find((u) => u.id === currentUser);
  const row = document.createElement("div");
  row.className = "msg outbound";
  row.dataset.typing = "true";
  row.innerHTML = `${avatarMarkup(me?.name || currentUser, `agent:${currentUser}`, "av-sm")}
    <div class="msg-body"><div class="bubble typing"><span></span><span></span><span></span></div></div>`;
  els.messages.appendChild(row);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderQuickReplies() {
  if (!els.quickReplies) return;
  const replies = [t("qr1"), t("qr2"), t("qr3")];
  els.quickReplies.innerHTML = `<span class="qr-label">${t("quickReplies")}</span>` +
    replies.map((r) => `<button type="button" class="qr-chip" title="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("");
  els.quickReplies.querySelectorAll(".qr-chip").forEach((b) => {
    b.addEventListener("click", () => { els.messageInput.value = b.textContent; els.messageInput.focus(); });
  });
}

function resetThread() {
  els.threadTitle.textContent = t("selectConversation");
  els.threadMeta.textContent = "";
  if (els.threadAvatar) { els.threadAvatar.textContent = ""; els.threadAvatar.removeAttribute("style"); els.threadAvatar.className = "avatar av-lg"; }
  els.contextScroll.innerHTML = `<div class="empty">${icon("user")}<span>${escapeHtml(t("selectConversationHint"))}</span></div>`;
}

/* =============================== Context panel =============================== */
function renderContextPanel(conversation) {
  const assignees = users.map((u) => `<option value="${u.id}" ${conversation.assigneeId === u.id ? "selected" : ""}>${escapeHtml(u.name)}</option>`).join("");
  const priority = conversation.priority || "normal";
  els.contextScroll.innerHTML = `
    <div class="ctx-section">
      <div class="ctx-title">${icon("user")}${t("ctxCustomer")}</div>
      <div class="ctx-customer">
        ${avatarMarkup(conversation.displayName, conversation.id, "av-lg")}
        <div><div class="ctx-name">${escapeHtml(conversation.displayName)}</div>
        <div class="ctx-meta">${escapeHtml(platformLabel(conversation.account.platform))} · ${escapeHtml(conversation.account.name)} · ${sourceTypeLabel(conversation.sourceType)}<br>${escapeHtml(conversation.sourceId)}</div></div>
      </div>
    </div>
    <div class="ctx-section">
      <div class="ctx-title">${icon("circle-dot")}${t("ctxProperties")}</div>
      <div class="ctx-field"><label for="conversationStatus">${t("statusField")}</label>
        <select id="conversationStatus">
          <option value="open" ${conversation.status === "open" ? "selected" : ""}>${t("open")}</option>
          <option value="pending" ${conversation.status === "pending" ? "selected" : ""}>${t("pending")}</option>
          <option value="resolved" ${conversation.status === "resolved" ? "selected" : ""}>${t("resolved")}</option>
        </select></div>
      <div class="ctx-field"><label for="conversationPriority">${t("priorityField")}</label>
        <select id="conversationPriority">
          <option value="low" ${priority === "low" ? "selected" : ""}>${t("priorityLow")}</option>
          <option value="normal" ${priority === "normal" ? "selected" : ""}>${t("priorityNormal")}</option>
          <option value="high" ${priority === "high" ? "selected" : ""}>${t("priorityHigh")}</option>
        </select></div>
      <div class="ctx-field"><label for="conversationAssignee">${t("assigneeField")}</label>
        <select id="conversationAssignee"><option value="">${t("unassigned")}</option>${assignees}</select></div>
      <div class="ctx-field"><label for="conversationTags">${t("tagsField")}</label>
        <input id="conversationTags" value="${escapeHtml((conversation.tags || []).join(", "))}" placeholder="${t("tagsPlaceholder")}" /></div>
      <div class="ctx-actions"><button id="saveConversationBtn" class="btn btn-primary" type="button">${icon("check")}<span class="btn-text">${t("save")}</span></button></div>
    </div>
    <div class="ctx-section">
      <div class="ctx-title">${icon("sparkles")}${t("ctxSummaryTitle")}</div>
      <div class="ctx-summary" id="ctxSummaryBox">${aiSummary(conversation)}</div>
    </div>
    <div class="ctx-section">
      <div class="ctx-title">${icon("history")}${t("ctxHandoffTitle")}</div>
      <div class="handoff-list">${handoffTimeline(conversation)}</div>
      <form id="noteForm" class="note-form">
        <input id="noteInput" placeholder="${t("notePlaceholder")}" />
        <button type="submit" class="btn btn-soft">${t("add")}</button>
      </form>
    </div>`;
  bindContextPanel(conversation);
}

function aiSummary(conversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  const tags = (conversation.tags || []);
  const advice = conversation.status === "resolved" ? t("summaryAdviceResolved") : conversation.status === "pending" ? t("summaryAdvicePending") : t("summaryAdviceOpen");
  return `<span class="ai-line">${t("summaryFrom")} <b>${escapeHtml(conversation.account.name)}</b> · ${escapeHtml(conversation.displayName)}</span>
    <span class="ai-line">${t("summaryStatusLabel")}：<b>${statusLabel(conversation.status)}</b> · ${t("priorityField")}：<b>${priorityLabel(conversation.priority)}</b></span>
    <span class="ai-line">${t("summaryLastLabel")}：「${escapeHtml(truncate(last ? last.text : "", 56))}」</span>
    <span class="ai-line">${t("summaryTagsLabel")}：${tags.length ? tags.map((x) => escapeHtml(x)).join("、") : t("summaryNone")}</span>
    <span class="ai-line">${advice}</span>`;
}

function handoffTimeline(conversation) {
  const events = [];
  const firstMsg = conversation.messages[0];
  events.push({ icon: "circle-dot", cls: "", title: t("handoffCreated"), text: conversation.displayName, time: firstMsg ? firstMsg.createdAt : conversation.updatedAt });
  if (conversation.assignee) events.push({ icon: "user-plus", cls: "green", title: t("handoffAssigned"), text: conversation.assignee.name, time: conversation.updatedAt });
  (conversation.internalNotes || []).forEach((n) => events.push({ icon: "file", cls: "amber", title: t("handoffNote"), text: `${authorName(n.authorId)}：${n.text}`, time: n.createdAt }));
  events.sort((a, b) => new Date(a.time) - new Date(b.time));
  const list = events.map((e) => `<div class="handoff-item">
      <span class="hi-icon ${e.cls}">${icon(e.icon)}</span>
      <div><strong>${escapeHtml(e.title)}</strong><p>${escapeHtml(e.text)}</p><small>${escapeHtml(formatTime(e.time))}</small></div>
    </div>`).join("");
  return list || `<p class="empty">${escapeHtml(t("noNotes"))}</p>`;
}

function bindContextPanel(conversation) {
  const saveBtn = document.getElementById("saveConversationBtn");
  saveBtn.addEventListener("click", () => runButton(saveBtn, async () => {
    const tags = document.getElementById("conversationTags").value.split(",").map((x) => x.trim()).filter(Boolean);
    await api(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: document.getElementById("conversationStatus").value,
        priority: document.getElementById("conversationPriority").value,
        assigneeId: document.getElementById("conversationAssignee").value,
        tags
      })
    });
    setStatus(t("statusUpdated"));
    await renderStats();
    await loadConversations();
    await openConversation(conversation.id, { silent: true });
  }));

  document.getElementById("noteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("noteInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      await api(`/api/conversations/${encodeURIComponent(conversation.id)}/notes`, { method: "POST", body: JSON.stringify({ text }) });
      setStatus(t("noteAdded"));
      await openConversation(conversation.id, { silent: true });
    } catch (error) { setStatus(error.message, "error"); }
  });
}

/* Button loading -> success helper */
async function runButton(button, task) {
  if (button.classList.contains("is-loading")) return;
  button.classList.add("is-loading");
  try {
    await task();
    button.classList.remove("is-loading");
    button.classList.add("is-success");
    setTimeout(() => button.classList.remove("is-success"), 900);
  } catch (error) {
    button.classList.remove("is-loading");
    setStatus(error.message, "error");
  }
}

/* =============================== Accounts / access views =============================== */
function renderAccounts() {
  els.connectedAccountsCount.textContent = `${accounts.length} ${t("connectedCount")}`;
  els.accountList.innerHTML = accounts.map((account) => `<div class="account">
      <div class="account-main">
        ${account.pictureUrl
          ? `<img class="account-picture" src="${escapeHtml(account.pictureUrl)}" alt="" />`
          : avatarMarkup(account.name, account.id, "av-md")}
        <div>
          <strong>${escapeHtml(account.name)}</strong>
          <div class="account-meta">
            <span class="platform-badge ${escapeHtml(account.platform)}">${platformLogo(account.platform, "sm")}${escapeHtml(platformLabel(account.platform))}</span>
            ${account.verifiedAt ? `<span class="kv verified"><i></i>${t("verifiedAccount")}</span>` : ""}
            <span class="kv ${account.hasToken ? "ok" : "missing"}"><i></i>${t("token")} ${account.hasToken ? t("ok") : t("missing")}</span>
            <span class="kv ${account.hasSecret ? "ok" : "missing"}"><i></i>${t("secret")} ${account.hasSecret ? t("ok") : t("missing")}</span>
            ${account.basicId ? `<span class="kv">${escapeHtml(account.basicId)}</span>` : ""}
            <span class="kv">${escapeHtml(account.id)}</span>
          </div>
          <p class="webhook">${escapeHtml(location.origin + account.webhookPath)}</p>
        </div>
      </div>
      <button class="btn btn-soft" data-simulate="${escapeHtml(account.id)}" type="button">${icon("zap")}<span>${t("testInbound")}</span></button>
    </div>`).join("");
  els.accountList.querySelectorAll("[data-simulate]").forEach((button) => {
    button.addEventListener("click", () => runButton(button, async () => {
      await api("/api/simulate", { method: "POST", body: JSON.stringify({ accountId: button.dataset.simulate, text: `${t("testMessageCreated")} · ${new Date().toLocaleTimeString(localeTag())}` }) });
      setStatus(t("testMessageCreated"));
      await renderStats();
      await loadConversations();
    }));
  });
}

async function renderStorageStatus() {
  if (!els.storageSafety) return;
  try {
    const { storage } = await api("/api/storage/status");
    const healthy = storage.integrity === "ok" && !storage.lastBackupError;
    if (!healthy) {
      els.storageSafety.hidden = true;
      return;
    }
    const detail = t("storageSafeDetail")
      .replace("{snapshots}", String(storage.snapshots))
      .replace("{backups}", String(storage.backups));
    els.storageSafety.innerHTML = `
      <span class="storage-safety-icon">${icon("check")}</span>
      <span><strong>${escapeHtml(t("storageSafeTitle"))}</strong><small>${escapeHtml(detail)}</small></span>
      ${storage.recoveredAtStartup ? `<em>${escapeHtml(t("storageRecovered"))}</em>` : ""}`;
    els.storageSafety.hidden = false;
  } catch {
    els.storageSafety.hidden = true;
  }
}

function renderConnectionResult(result) {
  lastConnection = result;
  const { account, connection } = result;
  const title = connection.mode === "demo"
    ? t("connectionDemo")
    : connection.platform && connection.platform !== "line" ? t("platformVerified") : t("connectionVerified");
  els.connectionResult.hidden = false;
  els.connectionResult.innerHTML = `
    <div class="connection-status-icon">${icon("check")}</div>
    <div class="connection-result-main">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(platformLabel(account.platform))} · ${escapeHtml(account.name)}${account.basicId ? ` · ${escapeHtml(account.basicId)}` : account.externalAccountId ? ` · ${escapeHtml(account.externalAccountId)}` : ""}</p>
      <span class="connection-label">${escapeHtml(t("webhookLabel"))}</span>
      <div class="webhook-copy">
        <code>${escapeHtml(connection.webhookUrl)}</code>
        <button class="icon-btn" id="copyWebhookBtn" type="button" aria-label="${escapeHtml(t("copyWebhook"))}">${icon("file")}</button>
      </div>
      ${connection.webhookVerifyToken ? `<span class="connection-label verify-label">${escapeHtml(t("verifyTokenLabel"))}</span><code class="verify-token">${escapeHtml(connection.webhookVerifyToken)}</code>` : ""}
      <small class="connection-guidance ${connection.webhookReady ? "ready" : "warning"}">
        ${escapeHtml(connection.webhookReady ? t("webhookReady") : t("webhookHttpsRequired"))}
      </small>
    </div>`;
  document.getElementById("copyWebhookBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(connection.webhookUrl);
      setStatus(t("webhookCopied"));
    } catch {
      setStatus(t("copyFailed"), "error");
    }
  });
}

function platformLabel(platform) {
  return platform === "instagram" ? "Instagram" : platform === "messenger" ? "Messenger" : "LINE";
}

function platformLogo(platform, size = "sm") {
  const normalized = ["line", "messenger", "instagram"].includes(platform) ? platform : "line";
  const extension = normalized === "line" ? "png" : "svg";
  return `<img class="platform-logo platform-logo-${escapeHtml(size)}" src="/assets/platforms/${normalized}.${extension}" alt="${escapeHtml(platformLabel(normalized))}" />`;
}

function renderConnectorForm() {
  const isLine = activeConnectorPlatform === "line";
  const platform = platformLabel(activeConnectorPlatform);
  setText("lineMessagingApiLabel", `${platform} ${t("connectorKicker")}`);
  setText("connectSubtitle", isLine ? t("connectSubtitle") : t("metaConnectSubtitle"));
  setText("channelSecretLabel", isLine ? t("channelSecretLabel") : t("metaAppSecretLabel"));
  setText("channelTokenLabel", isLine ? t("channelTokenLabel") : t("metaTokenLabel"));
  setText("externalAccountLabel", t("metaAccountIdLabel"));
  els.accountSecretInput.placeholder = isLine ? t("channelSecretPlaceholder") : t("metaAppSecretLabel");
  els.accountTokenInput.placeholder = isLine ? t("channelTokenPlaceholder") : t("metaTokenLabel");
  els.externalAccountInput.placeholder = t("metaAccountIdPlaceholder");
  els.externalAccountField.hidden = isLine;
  els.externalAccountInput.required = !isLine;
  els.accountForm.classList.toggle("meta", !isLine);
  els.lineConsoleLink.href = isLine ? "https://developers.line.biz/console/" : "https://developers.facebook.com/apps/";
  btnText(els.lineConsoleLink, isLine ? t("openLineConsole") : t("openMetaConsole"));
  btnText(els.saveAccountBtn, t("connectLine"));
  els.connectorTabs.querySelectorAll("[data-platform]").forEach((button) => {
    const active = button.dataset.platform === activeConnectorPlatform;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderAccess() {
  els.accessList.innerHTML = users.map((user) => {
    const checks = accounts.map((account) => {
      const checked = user.role === "admin" || user.accountIds.includes(account.id) ? "checked" : "";
      const disabled = user.role === "admin" ? "disabled" : "";
      return `<label><input type="checkbox" data-user="${user.id}" value="${escapeHtml(account.id)}" ${checked} ${disabled} />${escapeHtml(account.name)}</label>`;
    }).join("");
    return `<div class="access-row">
        <div class="account-main">${avatarMarkup(user.name, user.id, "av-md")}
          <div><strong>${escapeHtml(user.name)}</strong><span class="role-tag">${roleLabel(user.role)}</span></div></div>
        <div class="access-checks">${checks}</div>
      </div>`;
  }).join("");
  els.accessList.querySelectorAll(".access-checks input").forEach((input) => {
    input.addEventListener("change", async () => {
      const selected = [...els.accessList.querySelectorAll(`input[data-user="${input.dataset.user}"]:checked`)].map((i) => i.value);
      try {
        await api(`/api/users/${input.dataset.user}/access`, { method: "PUT", body: JSON.stringify({ accountIds: selected }) });
        setStatus(t("accessUpdated"));
      } catch (error) { setStatus(error.message, "error"); }
    });
  });
}

/* =============================== Command palette =============================== */
let paletteCommands = [];
let paletteFocused = 0;

function buildCommands() {
  const list = [];
  // navigation
  list.push({ group: t("groupNav"), icon: "inbox", label: t("cmdGoInbox"), run: () => goView("inbox") });
  list.push({ group: t("groupNav"), icon: "grid", label: t("cmdGoAccounts"), run: () => goView("accounts") });
  list.push({ group: t("groupNav"), icon: "users", label: t("cmdGoAccess"), run: () => goView("access") });
  // actions
  list.push({ group: t("groupActions"), icon: "zap", label: t("triageTitle"), run: () => openDrawer("triage") });
  list.push({ group: t("groupActions"), icon: "file", label: t("handoffTitle"), run: () => openDrawer("handoff") });
  list.push({ group: t("groupActions"), icon: "chart", label: t("insightTitle"), run: () => openDrawer("insight") });
  list.push({ group: t("groupActions"), icon: "focus", label: t("cmdToggleFocus"), run: () => toggleFocus() });
  list.push({ group: t("groupActions"), icon: "panel-right", label: t("cmdToggleContext"), run: () => toggleContext() });
  list.push({ group: t("groupActions"), icon: "play", label: t("cmdStory"), run: () => startStory() });
  list.push({ group: t("groupActions"), icon: "refresh", label: t("cmdRefresh"), run: () => refreshAll() });
  // switches
  [{ id: "zh", name: t("zhLanguage") }, { id: "en", name: t("enLanguage") }].forEach((l) => {
    if (l.id !== currentLanguage) list.push({ group: t("groupSwitch"), icon: "languages", label: `${t("cmdLang")}${l.name}`, run: () => setLanguage(l.id) });
  });
  users.forEach((u) => { if (u.id !== currentUser) list.push({ group: t("groupSwitch"), icon: "user", label: `${t("cmdUser")}${u.name}`, run: () => setUser(u.id) }); });
  // current-conversation actions
  if (activeConversation) {
    ["open", "pending", "resolved"].forEach((s) => {
      if (activeConversation.status !== s) list.push({ group: t("groupActions"), icon: "circle-dot", label: `${t("cmdStatus")}${statusLabel(s)}`, run: () => quickStatus(s) });
    });
    users.forEach((u) => { if (activeConversation.assigneeId !== u.id) list.push({ group: t("groupActions"), icon: "user-plus", label: `${t("cmdAssign")}${u.name}`, run: () => quickAssign(u.id) }); });
  }
  // conversations
  currentConversations.forEach((c) => {
    list.push({ group: t("groupConversations"), icon: "message", label: c.displayName, hint: c.account?.name || c.accountId, run: () => { goView("inbox"); openConversation(c.id); } });
  });
  return list;
}

function openPalette() {
  paletteCommands = buildCommands();
  els.paletteInput.value = "";
  els.paletteOverlay.hidden = false;
  renderPalette("");
  els.paletteInput.focus();
}
function closePalette() { els.paletteOverlay.hidden = true; }

function renderPalette(query) {
  const q = query.trim().toLowerCase();
  const matches = q ? paletteCommands.filter((c) => (c.label + " " + (c.hint || "")).toLowerCase().includes(q)) : paletteCommands;
  paletteFocused = 0;
  if (!matches.length) { els.paletteList.innerHTML = `<div class="palette-empty">${escapeHtml(t("paletteEmpty"))}</div>`; els._matches = []; return; }
  let html = "", lastGroup = null;
  matches.forEach((c, i) => {
    if (c.group !== lastGroup) { html += `<div class="palette-group">${escapeHtml(c.group)}</div>`; lastGroup = c.group; }
    html += `<button class="palette-item ${i === 0 ? "focused" : ""}" type="button" role="option" data-i="${i}">
        ${icon(c.icon)}
        <span class="pi-text"><strong>${escapeHtml(c.label)}</strong>${c.hint ? `<small>${escapeHtml(c.hint)}</small>` : ""}</span>
        ${c.hint ? "" : `<span class="pi-tag">${escapeHtml(c.group)}</span>`}
      </button>`;
  });
  els.paletteList.innerHTML = html;
  els._matches = matches;
  els.paletteList.querySelectorAll(".palette-item").forEach((b) => {
    b.addEventListener("mousemove", () => setPaletteFocus(Number(b.dataset.i)));
    b.addEventListener("click", () => runPalette(Number(b.dataset.i)));
  });
}
function setPaletteFocus(i) {
  paletteFocused = i;
  els.paletteList.querySelectorAll(".palette-item").forEach((b) => b.classList.toggle("focused", Number(b.dataset.i) === i));
}
function movePaletteFocus(delta) {
  const items = els.paletteList.querySelectorAll(".palette-item");
  if (!items.length) return;
  let next = paletteFocused + delta;
  if (next < 0) next = items.length - 1;
  if (next >= items.length) next = 0;
  setPaletteFocus(next);
  items[next].scrollIntoView({ block: "nearest" });
}
function runPalette(i) {
  const cmd = (els._matches || [])[i];
  closePalette();
  if (cmd) cmd.run();
}

async function quickStatus(status) {
  if (!activeConversation) return;
  const id = activeConversation.id;
  try {
    await api(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setStatus(`${t("statusSetTo")} ${statusLabel(status)}`);
    await renderStats();
    await loadConversations();
    await openConversation(id, { silent: true });
  } catch (error) { setStatus(error.message, "error"); }
}
async function quickAssign(userId) {
  if (!activeConversation) return;
  const id = activeConversation.id;
  try {
    await api(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ assigneeId: userId }) });
    setStatus(`${t("assignedTo")} ${authorName(userId)}`);
    await loadConversations();
    await openConversation(id, { silent: true });
  } catch (error) { setStatus(error.message, "error"); }
}

/* =============================== Capability drawer =============================== */
function openDrawer(kind) {
  els.drawerOverlay.hidden = false;
  if (kind === "triage") buildTriageDrawer();
  else if (kind === "handoff") buildHandoffDrawer();
  else buildInsightDrawer();
  els.drawerCloseBtn.focus();
  setStatus(`${t("commandReady")}：${kind === "triage" ? t("triageTitle") : kind === "handoff" ? t("handoffTitle") : t("insightTitle")}`);
}
function closeDrawer() { els.drawerOverlay.hidden = true; }

async function buildTriageDrawer() {
  els.drawerKicker.textContent = t("drawerTriageKicker");
  els.drawerTitle.textContent = t("drawerTriageTitle");
  let all = currentConversations;
  try { all = (await api(`/api/conversations?status=all&accountId=all`)).conversations; } catch (_) { /* use cached */ }
  const options = [
    { key: "mine", cls: "cyan", icon: "user", title: t("triageMine"), sub: t("triageMineSub"), fn: (c) => c.assigneeId === currentUser && c.status !== "resolved" },
    { key: "unassigned", cls: "amber", icon: "user-plus", title: t("triageUnassigned"), sub: t("triageUnassignedSub"), fn: (c) => !c.assigneeId },
    { key: "high", cls: "coral", icon: "alert", title: t("triageHigh"), sub: t("triageHighSub"), fn: (c) => c.priority === "high" },
    { key: "waiting", cls: "cyan", icon: "clock", title: t("triageWaiting"), sub: t("triageWaitingSub"), fn: (c) => c.lastMessage?.direction === "inbound" && c.status !== "resolved" }
  ];
  els.drawerBody.innerHTML = `<div class="triage-list">${options.map((o) => `<button class="triage-option ${o.cls}" type="button" data-key="${o.key}">
      <span class="to-icon">${icon(o.icon)}</span>
      <span class="to-text"><strong>${escapeHtml(o.title)}</strong><small>${escapeHtml(o.sub)}</small></span>
      <span class="to-count">${all.filter(o.fn).length}</span>
    </button>`).join("")}</div>`;
  els.drawerBody.querySelectorAll("[data-key]").forEach((b) => {
    b.addEventListener("click", async () => {
      const opt = options.find((o) => o.key === b.dataset.key);
      clientFilter = { key: opt.key, fn: opt.fn };
      filters.status = "all"; filters.accountId = "all"; filters.query = "";
      els.statusFilter.value = "all"; els.accountFilter.value = "all"; els.searchInput.value = "";
      currentConversationId = null;
      closeDrawer();
      goView("inbox");
      await loadConversations();
      setStatus(`${t("filterApplied")}：${opt.title}`);
    });
  });
}

function buildHandoffDrawer() {
  els.drawerKicker.textContent = t("drawerHandoffKicker");
  els.drawerTitle.textContent = t("drawerHandoffTitle");
  if (!activeConversation) { els.drawerBody.innerHTML = `<div class="empty">${icon("file")}<span>${escapeHtml(t("handoffNoConversation"))}</span></div>`; return; }
  const c = activeConversation;
  const summaryText = handoffPlainText(c);
  els.drawerBody.innerHTML = `
    <div class="ctx-customer">${avatarMarkup(c.displayName, c.id, "av-lg")}
      <div><div class="ctx-name">${escapeHtml(c.displayName)}</div><div class="ctx-meta">${escapeHtml(c.account.name)} · ${statusLabel(c.status)} · ${priorityLabel(c.priority)}</div></div></div>
    <div class="ctx-title">${icon("history")}${t("ctxHandoffTitle")}</div>
    <div class="handoff-list">${handoffTimeline(c)}</div>
    <div class="ctx-title">${icon("sparkles")}${t("handoffSummaryTitle")}</div>
    <div class="drawer-summary" id="handoffSummary">${escapeHtml(summaryText)}</div>
    <button class="btn btn-primary" id="copyHandoffBtn" type="button">${icon("file")}<span>${t("copyHandoff")}</span></button>`;
  document.getElementById("copyHandoffBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(summaryText); setStatus(t("copied")); }
    catch (_) { setStatus(t("copyFailed"), "error"); }
  });
}

function handoffPlainText(c) {
  const lines = [];
  lines.push(`${c.displayName} — ${c.account.name}`);
  lines.push(`${t("statusField")}: ${statusLabel(c.status)} / ${t("priorityField")}: ${priorityLabel(c.priority)} / ${t("assigneeField")}: ${c.assignee?.name || t("unassigned")}`);
  lines.push(`${t("tagsField")}: ${(c.tags || []).join(", ") || t("summaryNone")}`);
  const last = c.messages[c.messages.length - 1];
  if (last) lines.push(`${t("summaryLastLabel")}: ${last.text}`);
  (c.internalNotes || []).forEach((n) => lines.push(`• ${authorName(n.authorId)}: ${n.text}`));
  return lines.join("\n");
}

async function buildInsightDrawer() {
  els.drawerKicker.textContent = t("drawerInsightKicker");
  els.drawerTitle.textContent = t("drawerInsightTitle");
  let all = currentConversations;
  try { all = (await api(`/api/conversations?status=all&accountId=all`)).conversations; } catch (_) {}
  if (!all.length) { els.drawerBody.innerHTML = `<div class="empty">${icon("chart")}<span>${escapeHtml(t("insightEmpty"))}</span></div>`; return; }
  const max = Math.max(...accounts.map((a) => all.filter((c) => c.accountId === a.id).length), 1);
  const byAccount = accounts.map((a) => {
    const items = all.filter((c) => c.accountId === a.id);
    return `<div class="insight-bar-row">
        <div class="ib-top"><span>${escapeHtml(a.name)}</span><span>${items.length} ${t("itemsUnit")}</span></div>
        <div class="insight-track"><div class="insight-fill cyan" style="width:${Math.round((items.length / max) * 100)}%;--tone:var(--cyan)"></div></div>
      </div>`;
  }).join("");
  const total = all.length;
  const split = [
    { key: "open", tone: "var(--green)", n: all.filter((c) => c.status === "open").length },
    { key: "pending", tone: "var(--amber)", n: all.filter((c) => c.status === "pending").length },
    { key: "resolved", tone: "var(--slate)", n: all.filter((c) => c.status === "resolved").length }
  ];
  const overall = split.map((s) => `<div class="insight-bar-row">
      <div class="ib-top"><span>${statusLabel(s.key)}</span><span>${s.n}</span></div>
      <div class="insight-track"><div class="insight-fill" style="width:${total ? Math.round((s.n / total) * 100) : 0}%;--tone:${s.tone}"></div></div>
    </div>`).join("");
  els.drawerBody.innerHTML = `
    <div class="insight-block"><div class="ctx-title">${icon("building")}${t("insightByAccount")}</div>${byAccount}</div>
    <div class="insight-block"><div class="ctx-title">${icon("chart")}${t("insightOverall")}</div>${overall}</div>`;
}

/* =============================== Demo story mode =============================== */
const storySteps = [
  { sel: ".list-panel", title: "story1Title", text: "story1Text" },
  { sel: '.cap[data-command="triage"]', title: "story2Title", text: "story2Text" },
  { sel: "#conversationAssignee", title: "story3Title", text: "story3Text" },
  { sel: "#ctxSummaryBox", title: "story4Title", text: "story4Text", typing: true },
  { sel: ".composer", title: "story5Title", text: "story5Text" },
  { sel: "#conversationStatus", title: "story6Title", text: "story6Text" }
];
let storyIndex = 0;
let storyTimer = null;

async function startStory() {
  document.body.classList.remove("focus-mode", "no-context");
  els.contextToggleBtn.setAttribute("aria-pressed", "true");
  btnText(els.focusModeBtn, t("focusMode"));
  goView("inbox");
  if (!currentConversationId && currentConversations[0]) await openConversation(currentConversations[0].id, { silent: true });
  storyIndex = 0;
  els.storyOverlay.hidden = false;
  renderStory();
}
function stopStory() {
  els.storyOverlay.hidden = true;
  clearTimeout(storyTimer);
  els.messages.querySelectorAll('[data-typing="true"]').forEach((n) => n.remove());
}
function renderStory() {
  clearTimeout(storyTimer);
  const step = storySteps[storyIndex];
  let target = document.querySelector(step.sel);
  if (!target || !target.offsetParent) target = document.querySelector(".thread-panel");
  const rect = target.getBoundingClientRect();
  const pad = 8;
  Object.assign(els.storySpotlight.style, {
    top: `${rect.top - pad}px`, left: `${rect.left - pad}px`,
    width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`
  });
  positionStoryCard(rect);
  els.storyStep.textContent = `${t("storyStepLabel")} ${storyIndex + 1} / ${storySteps.length}`;
  els.storyTitle.textContent = t(step.title);
  els.storyText.textContent = t(step.text);
  els.storyProgress.innerHTML = storySteps.map((_, i) => `<i class="${i <= storyIndex ? "done" : ""}"></i>`).join("");
  els.storyNextBtn.textContent = storyIndex === storySteps.length - 1 ? t("storyDone") : t("storyNext");
  els.storyPrevBtn.textContent = t("storyPrev");
  els.storyPrevBtn.disabled = storyIndex === 0;
  if (step.typing) { els.messages.querySelectorAll('[data-typing="true"]').forEach((n) => n.remove()); showTypingBubble(); }
  else els.messages.querySelectorAll('[data-typing="true"]').forEach((n) => n.remove());
  if (!prefersReducedMotion()) storyTimer = setTimeout(nextStory, 4600);
}
function positionStoryCard(rect) {
  const card = els.storyCard;
  const cw = 360, ch = 200;
  let top = rect.bottom + 14;
  if (top + ch > window.innerHeight) top = Math.max(14, rect.top - ch - 14);
  let left = rect.left;
  if (left + cw > window.innerWidth - 14) left = window.innerWidth - cw - 14;
  card.style.top = `${Math.max(14, top)}px`;
  card.style.left = `${Math.max(14, left)}px`;
}
function nextStory() {
  if (storyIndex < storySteps.length - 1) { storyIndex += 1; renderStory(); }
  else stopStory();
}
function prevStory() { if (storyIndex > 0) { storyIndex -= 1; renderStory(); } }

/* =============================== Menus open/close =============================== */
function toggleMenu(menuName) {
  const switcher = document.querySelector(`[data-menu="${menuName}"]`);
  const isOpen = switcher.classList.contains("open");
  closeMenus();
  if (!isOpen) {
    if (menuName === "notif") renderNotifMenu();
    switcher.classList.add("open");
    const trigger = switcher.querySelector("button");
    trigger.setAttribute("aria-expanded", "true");
    const firstOption = switcher.querySelector(".menu-option, .notif-item");
    if (firstOption) { switcher.querySelectorAll(".menu-option").forEach((o) => o.classList.remove("focused")); firstOption.classList.add("focused"); }
  }
}
function closeMenus() {
  document.querySelectorAll(".switcher.open").forEach((switcher) => {
    switcher.classList.remove("open");
    switcher.querySelector("button").setAttribute("aria-expanded", "false");
  });
}
function openMenuName() {
  const open = document.querySelector(".switcher.open");
  return open ? open.dataset.menu : null;
}
function moveMenuFocus(delta) {
  const open = document.querySelector(".switcher.open .menu-popover");
  if (!open) return;
  const options = [...open.querySelectorAll(".menu-option")];
  if (!options.length) return;
  let idx = options.findIndex((o) => o.classList.contains("focused"));
  idx = (idx + delta + options.length) % options.length;
  options.forEach((o) => o.classList.remove("focused"));
  options[idx].classList.add("focused");
  options[idx].scrollIntoView({ block: "nearest" });
}
function activateMenuFocus() {
  const focused = document.querySelector(".switcher.open .menu-option.focused");
  if (focused) focused.click();
}

/* =============================== Keyboard list nav =============================== */
function moveListFocus(delta) {
  const items = [...els.conversationList.querySelectorAll(".conversation")];
  if (!items.length) return;
  focusedIndex = Math.max(0, Math.min(items.length - 1, (focusedIndex < 0 ? 0 : focusedIndex) + delta));
  items.forEach((b, i) => b.classList.toggle("focused", i === focusedIndex));
  items[focusedIndex].scrollIntoView({ block: "nearest" });
}
function openFocusedConversation() {
  const items = [...els.conversationList.querySelectorAll(".conversation")];
  const target = items[focusedIndex];
  if (target) openConversation(target.dataset.id);
}

function anyOverlayOpen() {
  return !els.paletteOverlay.hidden || !els.drawerOverlay.hidden || !els.storyOverlay.hidden;
}
function isTyping(target) {
  return target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
}

/* =============================== Event wiring =============================== */
function wireEvents() {
  document.querySelectorAll(".nav").forEach((b) => b.addEventListener("click", () => goView(b.dataset.view)));
  els.refreshBtn.addEventListener("click", () => runButton(els.refreshBtn, refreshAll));
  els.focusModeBtn.addEventListener("click", toggleFocus);
  els.contextToggleBtn.addEventListener("click", toggleContext);
  els.storyModeBtn.addEventListener("click", startStory);
  els.globalSearchBtn.addEventListener("click", openPalette);

  document.querySelectorAll(".cap").forEach((card) => card.addEventListener("click", () => openDrawer(card.dataset.command)));

  els.languageMenuButton.addEventListener("click", () => toggleMenu("language"));
  els.userMenuButton.addEventListener("click", () => toggleMenu("user"));
  els.notifBtn.addEventListener("click", () => toggleMenu("notif"));
  document.addEventListener("click", (e) => { if (!e.target.closest(".switcher")) closeMenus(); });

  els.statusFilter.addEventListener("change", async () => { filters.status = els.statusFilter.value; clientFilter = null; currentConversationId = null; await loadConversations(); });
  els.accountFilter.addEventListener("change", async () => { filters.accountId = els.accountFilter.value; currentConversationId = null; await loadConversations(); });
  els.sortFilter.addEventListener("change", () => { sortMode = els.sortFilter.value; renderConversationList(); });
  els.searchInput.addEventListener("input", debounce(async () => { filters.query = els.searchInput.value; clientFilter = null; currentConversationId = null; await loadConversations(); }, 250));

  els.sendForm.addEventListener("submit", onSend);
  els.accountForm.addEventListener("submit", onSaveAccount);
  els.connectorTabs.querySelectorAll("[data-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      activeConnectorPlatform = button.dataset.platform;
      lastConnection = null;
      els.connectionResult.hidden = true;
      els.accountForm.reset();
      renderConnectorForm();
    });
  });

  // palette
  els.paletteInput.addEventListener("input", () => renderPalette(els.paletteInput.value));
  els.paletteOverlay.addEventListener("click", (e) => { if (e.target === els.paletteOverlay) closePalette(); });
  // drawer
  els.drawerCloseBtn.addEventListener("click", closeDrawer);
  els.drawerOverlay.addEventListener("click", (e) => { if (e.target === els.drawerOverlay) closeDrawer(); });
  // story
  els.storyCloseBtn.addEventListener("click", stopStory);
  els.storyNextBtn.addEventListener("click", nextStory);
  els.storyPrevBtn.addEventListener("click", prevStory);
  window.addEventListener("resize", () => { if (!els.storyOverlay.hidden) renderStory(); });

  // online/offline
  window.addEventListener("offline", () => setStatus(t("offline"), "error"));
  window.addEventListener("online", () => setStatus(t("backOnline")));

  document.addEventListener("keydown", onKeydown);
}

async function onSend(event) {
  event.preventDefault();
  if (!currentConversationId) return;
  const text = els.messageInput.value.trim();
  if (!text) return;
  els.messageInput.value = "";
  showTypingBubble();
  try {
    await api(`/api/conversations/${encodeURIComponent(currentConversationId)}/send`, { method: "POST", body: JSON.stringify({ text }) });
    setStatus(t("messageSent"));
  } catch (error) { setStatus(error.message, "error"); }
  await renderStats();
  await openConversation(currentConversationId, { silent: true });
  await loadConversations();
}

async function onSaveAccount(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const secret = els.accountSecretInput.value.trim();
  const token = els.accountTokenInput.value.trim();
  const externalAccountId = els.externalAccountInput.value.trim();
  const isLine = activeConnectorPlatform === "line";
  const endpoint = isLine ? "/api/line/connect" : `/api/platforms/${activeConnectorPlatform}/connect`;
  const payload = isLine
    ? { channelSecret: secret, channelAccessToken: token }
    : { appSecret: secret, pageAccessToken: token, externalAccountId };
  els.saveAccountBtn.classList.add("is-loading");
  try {
    const result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
    formElement.reset();
    renderConnectionResult(result);
    setStatus(t("accountSaved"));
    await refreshAll();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.saveAccountBtn.classList.remove("is-loading");
  }
}

function onKeydown(e) {
  // Command palette toggle
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); els.paletteOverlay.hidden ? openPalette() : closePalette(); return; }

  if (e.key === "Escape") {
    if (!els.storyOverlay.hidden) { stopStory(); return; }
    if (!els.paletteOverlay.hidden) { closePalette(); return; }
    if (!els.drawerOverlay.hidden) { closeDrawer(); return; }
    if (openMenuName()) { closeMenus(); return; }
  }

  // palette nav
  if (!els.paletteOverlay.hidden) {
    if (e.key === "ArrowDown") { e.preventDefault(); movePaletteFocus(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); movePaletteFocus(-1); }
    else if (e.key === "Enter") { e.preventDefault(); runPalette(paletteFocused); }
    return;
  }

  // story nav
  if (!els.storyOverlay.hidden) {
    if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); nextStory(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prevStory(); }
    return;
  }

  // open menu nav
  if (openMenuName() && openMenuName() !== "notif") {
    if (e.key === "ArrowDown") { e.preventDefault(); moveMenuFocus(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); moveMenuFocus(-1); return; }
    if (e.key === "Enter") { e.preventDefault(); activateMenuFocus(); return; }
  }

  if (anyOverlayOpen() || isTyping(e.target)) return;

  // conversation list nav (inbox active)
  const inboxActive = !document.getElementById("inboxView").classList.contains("hidden");
  if (inboxActive) {
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); moveListFocus(1); }
    else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); moveListFocus(-1); }
    else if (e.key === "Enter") { e.preventDefault(); openFocusedConversation(); }
  }
}

/* =============================== Labels / utils =============================== */
function statusLabel(status) { return { open: t("open"), pending: t("pending"), resolved: t("resolved") }[status] || status; }
function priorityLabel(p) { return { low: t("priorityLow"), normal: t("priorityNormal"), high: t("priorityHigh") }[p] || t("priorityNormal"); }
function roleLabel(role) { return role === "admin" ? t("adminRole") : t("agentRole"); }
function sourceTypeLabel(s) { return { user: t("userSource"), group: t("groupSource"), room: t("roomSource") }[s] || s; }
function directionLabel(d) { return { inbound: t("inbound"), outbound: t("outbound") }[d] || d; }
function messageStatusLabel(s) { return { received: t("received"), sent: t("sent"), failed: t("failed") }[s] || s || t("ok"); }
function authorName(userId) { return users.find((u) => u.id === userId)?.name || userId; }
function truncate(text, n) { const s = String(text || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

boot().catch((error) => { try { setStatus(error.message, "error"); } catch (_) { console.error(error); } });

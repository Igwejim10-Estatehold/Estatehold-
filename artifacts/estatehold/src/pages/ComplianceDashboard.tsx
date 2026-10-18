import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, BadgeCheck, Banknote, Building2, Check, ChevronRight, CircleAlert, Clock3, FileLock2, Landmark, RefreshCw, Search, Settings2, Users, X } from "lucide-react";

type Row = Record<string, unknown>;
type Props = { token?: string; executive?: boolean; supabaseUrl?: string; supabaseAnonKey?: string };
const baseTabs = ["Overview", "Landlords", "Tenants", "Properties", "Payouts", "Users"] as const;
const executiveTabs = [...baseTabs, "Transactions", "Audit", "Settings"] as const;
type Tab = typeof executiveTabs[number];
const label = (row: Row, key: string) => String(row[key] ?? "—");
const fmtMoney = (value: unknown) => `₦${Number(value ?? 0).toLocaleString("en-NG")}`;
const tabsIcon: Record<Tab, typeof Activity> = { Overview: Activity, Landlords: Users, Tenants: Users, Properties: Building2, Payouts: Banknote, Users, Transactions: Activity, Audit: FileLock2, Settings: Settings2 };

export default function ComplianceDashboard({ token, executive = false, supabaseUrl, supabaseAnonKey }: Props) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [summary, setSummary] = useState<Row | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Row>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalPages, setTransactionTotalPages] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<{ kind: string; row: Row } | null>(null);
  const request = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Dashboard request failed.");
    return data;
  }, [token]);

  useEffect(() => {
    if (!token) { setLoading(false); setError("Sign in with an authorized account to access this workspace."); return; }
    let active = true;
    setLoading(true); setError(""); setSuccess("");
    const path: Partial<Record<Tab, string>> = {
      Landlords: "/api/admin/compliance/landlords?review_status=eq.pending",
      Tenants: "/api/admin/compliance/tenants?status=eq.pending",
      Properties: executive ? "/api/executive/compliance/properties" : "/api/admin/compliance/properties",
      Payouts: "/api/admin/compliance/payouts",
      Users: "/api/admin/compliance/users",
      Audit: "/api/executive/audit",
      Transactions: `/api/executive/transactions?page=${transactionPage}`,
    };
    const tasks: Promise<unknown>[] = [
      request("/api/admin/compliance/summary").then(data => { if (active) setSummary(data); }),
      path[tab] ? request(path[tab]!).then(data => { if (active) { setItems(Array.isArray(data) ? data : data.items ?? []); if (tab === "Transactions") setTransactionTotalPages(Math.max(1, Number(data.totalPages ?? 1))); } }) : Promise.resolve().then(() => { if (active && tab !== "Settings") setItems([]); }),
    ];
    if (executive && (tab === "Overview" || tab === "Transactions")) tasks.push(request("/api/executive/metrics").then(data => { if (active) setSummary(old => ({ ...(old ?? {}), ...data })); }));
    if (executive && tab === "Settings") tasks.push(request("/api/executive/settings").then(data => {
      if (!active) return;
      const normalized = (data.settings ?? data) as Row;
      setSettings(normalized); setSettingsDraft(normalized);
    }));
    Promise.all(tasks).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load dashboard."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tab, request, refresh, executive, transactionPage]);

  async function review(kind: string, row: Row, decision: "approved" | "rejected", reason = "") {
    const id = String(row.user_id ?? row.id ?? "");
    if (!id) { setError("This record is missing its review identifier."); return; }
    const key = `${kind}:${id}`; setBusy(key); setError(""); setSuccess("");
    try {
      await request(`/api/admin/compliance/${kind}/${encodeURIComponent(id)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
      setSuccess(`${kind[0].toUpperCase()}${kind.slice(1)} ${decision}.`);
      setRejectTarget(null); setRefresh(value => value + 1);
    } catch (reasonError) { setError(reasonError instanceof Error ? reasonError.message : "Review could not be saved."); }
    finally { setBusy(""); }
  }
  async function viewPrivateDocument(rawPath: unknown) {
    const path = typeof rawPath === "string" ? rawPath : "";
    if (!token || !supabaseUrl || !supabaseAnonKey || !path || path.split("/").includes("..")) { setError("Private document is unavailable."); return; }
    try {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/estatehold-kyc/${encoded}`, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("You do not have access to this private document.");
      const url = URL.createObjectURL(await response.blob());
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) { URL.revokeObjectURL(url); throw new Error("Allow pop-ups to view this private document."); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Document could not be opened."); }
  }
  async function changeRole(row: Row) {
    const id = String(row.id ?? "");
    if (!id) return;
    const key = `role:${id}`; setBusy(key); setError(""); setSuccess("");
    try {
      const newRole = row.role === "admin" ? "client" : "admin";
      await request(`/api/executive/users/${encodeURIComponent(id)}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }) });
      setSuccess(`User role changed to ${newRole}.`); setRefresh(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "User role could not be changed."); }
    finally { setBusy(""); }
  }
  async function processPayout(row: Row) {
    const id = String(row.id ?? "");
    if (!id || row.status !== "awaiting_destination") return;
    const key = `payout:${id}`; setBusy(key); setError(""); setSuccess("");
    try {
      const result = await request(`/api/admin/compliance/payouts/${encodeURIComponent(id)}/process`, { method: "POST" });
      setSuccess(`Payout processing started. Current status: ${String(result.status ?? "initiating")}.`);
      setRefresh(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Payout could not be started."); }
    finally { setBusy(""); }
  }
  async function finalDecision(row: Row, approve: boolean, override = false) {
    const id = String(row.id ?? "");
    if (!id) return;
    const reason = (!approve || override) ? window.prompt(override ? "Reason for overriding the admin decision" : "Reason for rejecting this property")?.trim() : "";
    if ((!approve || override) && !reason) return;
    const key = `property:${id}`; setBusy(key); setError(""); setSuccess("");
    try {
      await request(`/api/executive/properties/${encodeURIComponent(id)}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve, override, reason }) });
      setSuccess(override ? `Executive override ${approve ? "approved" : "rejected"} the property.` : `Executive ${approve ? "approved" : "rejected"} the property.`);
      setRefresh(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Final approval could not be saved."); }
    finally { setBusy(""); }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingSettings(true); setError(""); setSuccess("");
    try {
      await request("/api/executive/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsDraft) });
      setSettings(settingsDraft); setSuccess("System settings saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Settings could not be saved."); }
    finally { setSavingSettings(false); }
  }

  const cards: Array<[string, unknown, string, typeof Activity]> = [
    ["Properties", summary?.totalProperties, "Total listings", Building2],
    ["Landlords to review", summary?.pendingLandlords, "Awaiting identity review", Users],
    ["Tenant applications", summary?.totalTenants, "Applications received", Users],
    ["Rent collected", fmtMoney(summary?.rentCollectedNaira), "Collected to date", Banknote],
    ["Pending payouts", summary?.pendingPayouts, "Settlement queue", Clock3],
    ["Rented properties", summary?.rentedProperties, "Currently occupied", Landmark],
    ...(executive ? [["Paystack balance", fmtMoney(Number(summary?.balanceKobo ?? 0) / 100), "Live balance", Banknote] as [string, unknown, string, typeof Activity], ["Executive profit", fmtMoney(summary?.executiveProfitNaira), "Current profit", Activity] as [string, unknown, string, typeof Activity]] : []),
  ];
  const visibleItems = items.filter(row => !query || Object.values(row).some(value => String(value ?? "").toLowerCase().includes(query.toLowerCase())));
  const navTabs = executive ? executiveTabs : baseTabs;
  return <main className="page-enter mx-auto max-w-[1440px] space-y-5 px-4 pb-12 pt-7 sm:px-6 lg:px-9 lg:pt-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#688270]"><span className="h-px w-7 bg-[#bd985b]"/>{executive ? "Estatehold · Executive office" : "Estatehold · Operations desk"}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em] text-[#203b2b] sm:text-4xl">{executive ? "Executive workspace" : "Operations workspace"}</h1>
        <p className="mt-2 text-sm text-[#718077]">{executive ? "Financial oversight, final approvals and system controls." : "Review applications, properties and rental settlements."}</p>
      </div>
      <button data-testid="button-refresh-dashboard" onClick={() => setRefresh(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d9e1d6] bg-[#fffefa] px-4 text-sm font-bold text-[#365642] hover:bg-[#f4f6ef]" aria-label="Refresh dashboard"><RefreshCw size={15}/>Refresh</button>
    </header>

    <nav className="hide-scroll -mx-4 flex snap-x gap-1 overflow-x-auto border-b border-[#dce4d8] px-4 sm:mx-0 sm:px-0" aria-label="Dashboard sections">
      {navTabs.map(item => { const Icon = tabsIcon[item]; return <button key={item} data-testid={`tab-${item.toLowerCase()}`} aria-current={tab === item ? "page" : undefined} onClick={() => { setTab(item); setQuery(""); setRejectTarget(null); }} className={`flex min-h-12 shrink-0 snap-start items-center gap-2 border-b-2 px-3 text-sm font-bold transition-colors ${tab === item ? "border-[#3e7954] text-[#275d3d]" : "border-transparent text-[#758278] hover:text-[#365642]"}`}><Icon size={15}/>{item}</button>; })}
    </nav>

    {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-[#ead0c8] bg-[#fff7f3] p-4 text-sm text-[#8a4438]"><span className="flex gap-2"><CircleAlert size={17} className="mt-0.5 shrink-0"/>{error}</span><button onClick={() => setRefresh(value => value + 1)} className="shrink-0 font-bold underline">Retry</button></div>}
    {success && <div role="status" className="flex items-center gap-2 rounded-2xl border border-[#c9dfcb] bg-[#f1f7ee] p-3 text-sm font-semibold text-[#315d42]"><Check size={17}/>{success}</div>}

    {tab === "Overview" && <section aria-label="Live summary">
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold text-[#294333]">Live summary</h2><p className="mt-1 text-xs text-[#78857b]">Current figures from Estatehold systems</p></div><span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#557662]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#55876a]"/>Live data</span></div>
      {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title]) => <div key={title} className="skeleton h-32 rounded-2xl"/> )}</div> :
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title, value, note, Icon], index) => <article key={title} data-testid={`metric-${index}`} className={`relative overflow-hidden rounded-2xl border p-5 ${index === 0 ? "border-[#315c40] bg-[#285139] text-[#f5f3eb]" : "border-[#e1e6db] bg-[#fffefa] text-[#243d2d]"}`}><span className={`absolute -right-3 -top-3 h-24 w-24 rounded-full border ${index === 0 ? "border-white/10" : "border-[#e6eadf]"}`}/><div className="relative flex items-start justify-between"><div><p className={`text-xs font-semibold ${index === 0 ? "text-[#d2dfd1]" : "text-[#79867b]"}`}>{title}</p><p className="mt-3 font-display text-2xl font-extrabold tracking-tight">{String(value ?? "—")}</p><p className={`mt-1 text-[11px] ${index === 0 ? "text-[#cad9c9]" : "text-[#89948a]"}`}>{note}</p></div><Icon className={index === 0 ? "text-[#d3b77e]" : "text-[#6b8a70]"} size={19}/></div></article>)}</div>}
    </section>}

    {tab === "Settings" && executive && <section className="max-w-3xl rounded-2xl border border-[#e1e6db] bg-[#fffefa] p-5 sm:p-7">
      <div className="mb-6 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9efe5] text-[#345e43]"><Settings2 size={19}/></span><div><h2 className="font-display text-xl font-extrabold text-[#294333]">System settings</h2><p className="mt-1 text-sm text-[#77847a]">Authorized executive controls for Estatehold configuration.</p></div></div>
      {loading ? <div className="space-y-3" aria-label="Loading settings"><div className="skeleton h-12 rounded-xl"/><div className="skeleton h-12 rounded-xl"/><div className="skeleton h-12 rounded-xl"/></div> :
      settings ? <form onSubmit={event => void saveSettings(event)} className="space-y-4">
        {Object.entries(settingsDraft).map(([key, value]) => <label key={key} className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[#e5e9e0] bg-[#fbfcf8] px-4 py-3 text-sm font-semibold text-[#385140]"><span className="min-w-0 break-words">{key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ")}</span>
          {typeof value === "boolean" ? <input data-testid={`setting-${key}`} type="checkbox" checked={Boolean(value)} onChange={event => setSettingsDraft(old => ({ ...old, [key]: event.target.checked }))} className="h-5 w-5 accent-[#326d50]"/> :
          <input data-testid={`setting-${key}`} type={typeof value === "number" ? "number" : "text"} value={String(value ?? "")} onChange={event => setSettingsDraft(old => ({ ...old, [key]: typeof value === "number" ? Number(event.target.value) : event.target.value }))} className="min-h-10 w-1/2 min-w-0 rounded-lg border border-[#dce3d9] bg-white px-3 text-right font-normal focus:outline-none focus:ring-2 focus:ring-[#326d50]/20"/>}
        </label>)}
        {!Object.keys(settingsDraft).length && <p className="rounded-xl border border-dashed p-6 text-sm text-[#78857b]">No editable settings were returned.</p>}
        <button data-testid="button-save-settings" disabled={savingSettings || !Object.keys(settingsDraft).length} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#285139] px-5 text-sm font-bold text-white disabled:opacity-60">{savingSettings ? "Saving…" : <><Check size={16}/>Save settings</>}</button>
      </form> : <p className="rounded-xl border border-dashed p-6 text-sm text-[#78857b]">System settings are unavailable.</p>}
    </section>}

    {tab !== "Overview" && tab !== "Settings" && <section className="space-y-4">
      {(tab === "Landlords" || tab === "Tenants" || tab === "Properties" || tab === "Payouts" || tab === "Users" || tab === "Transactions" || tab === "Audit") && <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-xl font-extrabold text-[#294333]">{tab === "Landlords" ? "Landlord review queue" : tab === "Tenants" ? "Tenant application queue" : tab === "Properties" ? "Property approvals" : tab === "Payouts" ? "Rental payouts" : tab === "Users" ? "User directory" : tab === "Transactions" ? "Paystack transactions" : "Audit history"}</h2><p className="mt-1 text-xs text-[#78857b]">{loading ? "Loading current records…" : `${visibleItems.length} ${visibleItems.length === 1 ? "record" : "records"}`}</p></div>
        {["Users", "Payouts", "Transactions", "Audit"].includes(tab) && <label className="relative block w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#819087]" size={15}/><input data-testid="input-search-records" className="min-h-10 w-full rounded-xl border border-[#d9e1d6] bg-[#fffefa] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#326d50]/20" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${tab.toLowerCase()}`} aria-label={`Search ${tab.toLowerCase()}`}/></label>}
      </div>}
      {loading ? <div className="space-y-3" aria-label={`Loading ${tab.toLowerCase()}`}>{[0,1,2].map(index => <div key={index} className="skeleton h-32 rounded-2xl"/> )}</div> :
      tab === "Audit" ? <div className="space-y-3">{visibleItems.map((row, index) => <article key={String(row.id ?? index)} className="rounded-2xl border border-[#e1e6db] bg-[#fffefa] p-4 sm:p-5"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f1efe4] text-[#856a39]"><Clock3 size={17}/></span><div className="min-w-0 flex-1"><p className="font-bold text-[#294333]">{label(row, "action")}</p><p className="mt-1 break-words text-xs leading-5 text-[#78857b]">{label(row, "entity_type")} · {label(row, "entity_id")} · {label(row, "created_at")}</p>{Boolean(row.reason) && <p className="mt-2 rounded-lg bg-[#f5f5ef] p-3 text-sm text-[#53665a]">{label(row, "reason")}</p>}</div><ChevronRight className="mt-2 shrink-0 text-[#a3aca3]" size={16}/></div></article>)}</div> :
      <div className="space-y-3">{visibleItems.map((row, index) => {
        const kind = tab === "Landlords" ? "landlord" : tab === "Tenants" ? "tenant" : "property";
        const rowId = String(row.id ?? row.user_id ?? index);
        const status = String(row.review_status ?? row.status ?? row.approval_status ?? row.role ?? "Record");
        const documents: Array<[string, string, unknown]> = [
          ["means_of_id_url", "Means of ID", row.means_of_id_url],
          ["property_documents_urls", "Property document", Array.isArray(row.property_documents_urls) ? row.property_documents_urls[0] : row.property_documents_urls],
          ["passport_photo_url", "Passport photo", row.passport_photo_url],
        ];
        return <article key={rowId} data-testid={`record-${tab.toLowerCase()}-${rowId}`} className="rounded-2xl border border-[#e1e6db] bg-[#fffefa] p-4 shadow-[0_7px_20px_rgba(39,62,44,.025)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-display text-lg font-extrabold text-[#294333]">{label(row,"full_legal_name") !== "—" ? label(row,"full_legal_name") : label(row,"title") !== "—" ? label(row,"title") : label(row,"email")}</h3><span className="rounded-full bg-[#edf2e9] px-2.5 py-1 text-[10px] font-bold capitalize text-[#4c7055]">{status.replaceAll("_"," ")}</span></div>
              <p className="mt-1 text-sm text-[#718077]">{label(row,"state")} {label(row,"phone_number") !== "—" ? `· ${label(row,"phone_number")}` : ""} {label(row,"nin_last4") !== "—" ? `· NIN ending ${label(row,"nin_last4")}` : ""}</p>
              {tab === "Landlords" && <><p className="mt-3 text-sm text-[#465b4c]">{label(row,"permanent_house_address")} · WhatsApp {label(row,"whatsapp_number")}</p><p className="mt-1 text-xs text-[#78857b]">Bank {label(row,"bank_name")} · Account name {label(row,"account_name")}</p></>}
              {tab === "Properties" && <p className="mt-2 text-sm text-[#52665a]">Owner {label(row,"owner_id")} · Landlord KYC {row.landlord_kyc_verified === true ? "verified" : "not verified"} · Admin approval {String(row.admin_approved ?? row.approval_status ?? "pending")} · Executive approval {String(row.executive_approved ?? "pending")}</p>}
              {tab === "Payouts" && <p className="mt-2 text-sm text-[#52665a]">{label(row,"status")} · {fmtMoney(row.amount_naira)} · Reference {label(row,"transfer_reference")}</p>}
              {tab === "Users" && <p className="mt-2 text-sm text-[#52665a]">{label(row,"email")} · {label(row,"role")} · Verification {label(row,"verification_status")}</p>}
              {tab === "Tenants" && <><p className="mt-2 text-sm text-[#52665a]">Guarantor {label(row,"guarantor_name")} · {label(row,"status")}</p><p className="mt-1 text-xs text-[#78857b]">Home {label(row,"permanent_house_address")} · Employer {label(row,"employer_name")} · Next of kin {label(row,"next_of_kin_name")} {label(row,"next_of_kin_phone")}</p></>}
              {tab === "Transactions" && <p className="mt-2 text-sm text-[#52665a]">{label(row,"status")} · {fmtMoney(row.amount_naira ?? (Number(row.amount_kobo ?? 0) / 100))} · {label(row,"reference")} · {label(row,"created_at")}</p>}
              {(tab === "Payouts" || tab === "Transactions") && <p className="mt-1 text-xs text-[#78857b]">Provider reference: {label(row,"transfer_reference") !== "—" ? label(row,"transfer_reference") : label(row,"reference")}</p>}
            </div>
            {tab === "Landlords" && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{documents.map(([key, title, path]) => <button key={key} data-testid={`document-${key}-${rowId}`} disabled={!path} onClick={() => void viewPrivateDocument(path)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#dce4da] px-3 text-xs font-bold text-[#45654d] hover:bg-[#f3f6ef] disabled:cursor-not-allowed disabled:opacity-45"><FileLock2 size={14}/>{title}</button>)}</div>}
            {tab === "Tenants" && <button data-testid={`document-nin-${rowId}`} disabled={!row.nin_document_url} onClick={() => void viewPrivateDocument(row.nin_document_url)} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#dce4da] px-3 text-xs font-bold text-[#45654d] hover:bg-[#f3f6ef] disabled:opacity-45 sm:w-auto"><FileLock2 size={14}/>View NIN document</button>}
          </div>
          {["Landlords", "Tenants", "Properties"].includes(tab) && !(executive && tab === "Properties") && <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf0e9] pt-4">
            <button data-testid={`button-approve-${rowId}`} disabled={!!busy} onClick={() => void review(kind, row, "approved")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#285139] px-4 text-sm font-bold text-white hover:bg-[#1e432e] disabled:opacity-55"><Check size={15}/>{busy === `${kind}:${rowId}` ? "Saving…" : "Approve"}</button>
            <button data-testid={`button-reject-${rowId}`} disabled={!!busy} onClick={() => setRejectTarget({ kind, row })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#e7d0ca] px-4 text-sm font-bold text-[#914c40] hover:bg-[#fff6f3] disabled:opacity-55"><X size={15}/>Reject</button>
          </div>}
          {tab === "Users" && executive && <div className="mt-4 border-t border-[#edf0e9] pt-4"><button data-testid={`button-role-${rowId}`} disabled={!!busy} onClick={() => void changeRole(row)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#dce4da] px-4 text-sm font-bold text-[#45654d] hover:bg-[#f3f6ef] disabled:opacity-55"><Users size={15}/>{busy === `role:${rowId}` ? "Updating…" : row.role === "admin" ? "Remove admin access" : "Grant admin access"}</button></div>}
          {tab === "Payouts" && row.status === "awaiting_destination" && <div className="mt-4 border-t border-[#edf0e9] pt-4"><button data-testid={`button-process-payout-${rowId}`} disabled={!!busy} onClick={() => void processPayout(row)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#285139] px-4 text-sm font-bold text-white hover:bg-[#1e432e] disabled:opacity-55"><Banknote size={15}/>{busy === `payout:${rowId}` ? "Starting payout…" : "Process eligible payout"}</button><p className="mt-2 text-xs text-[#78857b]">Only live-verified rent payments with an approved landlord bank account can be processed.</p></div>}
          {tab === "Properties" && executive && row.admin_approved === true && row.executive_approved !== true && <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf0e9] pt-4"><button data-testid={`button-final-approval-${rowId}`} disabled={!!busy} onClick={() => void finalDecision(row, true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#285139] px-4 text-sm font-bold text-white hover:bg-[#1e432e] disabled:opacity-55"><BadgeCheck size={15}/>{busy === `property:${rowId}` ? "Saving…" : "Final approve"}</button><button data-testid={`button-final-reject-${rowId}`} disabled={!!busy} onClick={() => void finalDecision(row, false)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#e7d0ca] px-4 text-sm font-bold text-[#914c40] disabled:opacity-55"><X size={15}/>Reject</button></div>}
          {tab === "Properties" && executive && row.approval_status === "rejected" && <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf0e9] pt-4"><button data-testid={`button-override-approve-${rowId}`} disabled={!!busy} onClick={() => void finalDecision(row, true, true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#285139] px-4 text-sm font-bold text-white disabled:opacity-55"><BadgeCheck size={15}/>{busy === `property:${rowId}` ? "Saving…" : "Override approve"}</button><button data-testid={`button-override-reject-${rowId}`} disabled={!!busy} onClick={() => void finalDecision(row, false, true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#e7d0ca] px-4 text-sm font-bold text-[#914c40] disabled:opacity-55"><X size={15}/>Override reject</button></div>}
          {rejectTarget?.row === row && <form onSubmit={event => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") || "").trim(); if (reason) void review(rejectTarget.kind, rejectTarget.row, "rejected", reason); }} className="mt-4 rounded-xl border border-[#ead0c8] bg-[#fff8f5] p-4">
            <label className="block text-sm font-bold text-[#773f36]" htmlFor={`reject-reason-${rowId}`}>Reason for rejection<span className="ml-1 text-[#a14b3f]">*</span><textarea id={`reject-reason-${rowId}`} name="reason" required maxLength={500} rows={3} className="mt-2 w-full rounded-lg border border-[#e2c6be] bg-white p-3 text-sm font-normal text-[#34483b] outline-none focus:ring-2 focus:ring-[#a45445]/20" placeholder="Explain what needs attention"/></label>
            <div className="mt-3 flex gap-2"><button disabled={!!busy} className="min-h-10 rounded-lg bg-[#914c40] px-4 text-sm font-bold text-white disabled:opacity-50">Confirm rejection</button><button type="button" onClick={() => setRejectTarget(null)} className="min-h-10 rounded-lg border border-[#dfc7c0] px-4 text-sm font-bold text-[#704940]">Cancel</button></div>
          </form>}
        </article>;
      })}
      {!visibleItems.length && <div className="rounded-2xl border border-dashed border-[#cdd8ca] bg-[#fbfcf8] px-6 py-12 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#e9efe5] text-[#567760]"><Search size={19}/></span><h3 className="mt-4 font-display text-lg font-extrabold text-[#294333]">{items.length ? "No matching records" : "Queue is clear"}</h3><p className="mt-1 text-sm text-[#78857b]">{items.length ? "Try a different search term." : "There are no records to show right now."}</p></div>}
      {tab === "Transactions" && <div className="flex items-center justify-between border-t border-[#edf0e9] pt-4"><button data-testid="button-previous-transactions" disabled={transactionPage <= 1 || loading} onClick={() => setTransactionPage(page => Math.max(1, page - 1))} className="min-h-10 rounded-lg border px-4 text-sm font-bold disabled:opacity-45">Previous</button><span className="text-xs text-[#78857b]">Page {transactionPage} of {transactionTotalPages}</span><button data-testid="button-next-transactions" disabled={transactionPage >= transactionTotalPages || loading} onClick={() => setTransactionPage(page => Math.min(transactionTotalPages, page + 1))} className="min-h-10 rounded-lg border px-4 text-sm font-bold disabled:opacity-45">Next</button></div>}
      </div>}
    </section>}
  </main>;
}

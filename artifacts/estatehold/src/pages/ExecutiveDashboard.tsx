import { useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Check, CircleAlert,
  Clock3, Landmark, ShieldAlert, Wallet, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type SalesPeriod = 'daily' | 'monthly';

const dataSource = 'mock' as const;

const dailySales = [
  { label: '9 AM', sales: 1.8 }, { label: '10 AM', sales: 2.4 }, { label: '11 AM', sales: 2.1 },
  { label: '12 PM', sales: 3.2 }, { label: '1 PM', sales: 2.7 }, { label: '2 PM', sales: 4.1 },
  { label: '3 PM', sales: 3.8 }, { label: '4 PM', sales: 5.3 }, { label: '5 PM', sales: 4.6 },
  { label: '6 PM', sales: 6.2 },
];

const monthlySales = [
  { label: 'Jan', sales: 18.4 }, { label: 'Feb', sales: 22.7 }, { label: 'Mar', sales: 20.1 },
  { label: 'Apr', sales: 28.6 }, { label: 'May', sales: 25.3 }, { label: 'Jun', sales: 34.8 },
  { label: 'Jul', sales: 31.2 }, { label: 'Aug', sales: 39.6 }, { label: 'Sep', sales: 36.4 },
  { label: 'Oct', sales: 45.1 }, { label: 'Nov', sales: 42.8 }, { label: 'Dec', sales: 51.6 },
];

const activitySeed = [
  { id: 'ACT-4108', person: 'Tomiwa Akinyemi', initials: 'TA', action: 'approved KYC for', subject: 'Ifeoma Nwosu', time: 'Today, 10:42 AM', ip: '197.210.54.•••', tone: 'green' },
  { id: 'ACT-4107', person: 'Ngozi Eze', initials: 'NE', action: 'approved property', subject: 'Cedar Court · Lekki', time: 'Today, 9:18 AM', ip: '102.89.23.•••', tone: 'gold' },
  { id: 'ACT-4106', person: 'Babatunde Cole', initials: 'BC', action: 'approved KYC for', subject: 'Emeka Okorie', time: 'Yesterday, 4:36 PM', ip: '41.190.2.•••', tone: 'plum' },
];

const alertsSeed = [
  { id: 'FRD-0281', title: 'Unusual payment velocity', detail: '4 reservation attempts from one device in 11 minutes', location: 'Abuja · DEMO-PSK-1182', severity: 'High' },
  { id: 'FRD-0279', title: 'Account detail mismatch', detail: 'Beneficiary name differs from verified KYC record', location: 'Lagos · DEMO-PSK-1176', severity: 'Review' },
  { id: 'FRD-0274', title: 'Repeated failed verification', detail: 'Three identity checks failed for one applicant', location: 'Port Harcourt · DEMO-KYC-044', severity: 'Review' },
];

const notificationsSeed = [
  { id: 'N-104', title: 'Escrow release window', detail: 'DEMO-PSK-1171 reaches its 7-day review mark today.', time: '12 min ago', unread: true },
  { id: 'N-103', title: 'Fraud review needs attention', detail: 'Two demo risk alerts are waiting for an executive review.', time: '48 min ago', unread: true },
  { id: 'N-101', title: 'Payout batch prepared', detail: 'A mock payout batch is queued for review.', time: 'Yesterday', unread: false },
];

const money = (value: string) => value;

function MetricCard({
  label, value, detail, icon: Icon, accent = 'green', trend,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Wallet;
  accent?: 'green' | 'gold' | 'rust' | 'ink';
  trend?: string;
}) {
  const accents = {
    green: 'bg-[#e8f3e8] text-[#2c713d]',
    gold: 'bg-[#f8efd9] text-[#92722c]',
    rust: 'bg-[#f8e9e2] text-[#a6533f]',
    ink: 'bg-[#e8ece7] text-[#45594b]',
  };
  return (
    <article className="rounded-2xl border border-[#e5e9e1] bg-white p-5 shadow-[0_4px_18px_rgba(33,50,37,.025)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.13em] text-[#78857b]">{label}</p>
          <p className="mt-3 font-display text-[25px] font-extrabold leading-none tracking-[-.04em] text-[#17251b]">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accents[accent]}`}><Icon size={18} strokeWidth={1.8} /></span>
      </div>
      <div className="mt-4 flex min-h-5 items-center justify-between gap-2">
        <p className="text-xs text-[#78857b]">{detail}</p>
        {trend && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#38794a]"><ArrowUpRight size={13} />{trend}</span>}
      </div>
    </article>
  );
}

function SalesTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#dfe7dd] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#7d897f]">{label}</p>
      <p className="mt-1 font-display text-sm font-extrabold text-[#1b3322]">₦{payload[0].value?.toFixed(1)}m</p>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [period, setPeriod] = useState<SalesPeriod>('daily');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(notificationsSeed);
  const [alerts, setAlerts] = useState(alertsSeed);
  const sales = period === 'daily' ? dailySales : monthlySales;
  const unreadCount = notifications.filter(item => item.unread).length;

  const markAllRead = () => setNotifications(current => current.map(item => ({ ...item, unread: false })));
  const markRead = (id: string) => setNotifications(current => current.map(item => item.id === id ? { ...item, unread: false } : item));

  return (
    <main className="estate-shell page-enter min-h-[100dvh] px-4 py-6 text-[#17251b] sm:px-6 lg:px-9 lg:py-8">
      <div className="mx-auto max-w-[1460px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#69806d]">Estatehold <span className="px-1 text-[#c1c9bd]">/</span> Executive office</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em] sm:text-[38px]">Good morning, Executive.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#718077]">The portfolio at a glance. Decisions and numbers below are all illustrative.</p>
          </div>
          <div className="relative flex items-center gap-3">
            <span className="hidden rounded-full border border-[#dce6dc] bg-white px-3 py-2 text-xs font-bold text-[#526658] sm:inline-flex">
              <span className="mr-2 mt-1 h-2 w-2 rounded-full bg-[#c28d32]" /> Demo workspace
            </span>
            <button
              type="button"
              data-testid="button-notifications"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={notificationsOpen}
              aria-haspopup="dialog"
              onClick={() => setNotificationsOpen(open => !open)}
              className="relative grid h-11 w-11 place-items-center rounded-xl border border-[#e2e8e0] bg-white text-[#34493a] transition hover:bg-[#f1f6ef] focus:outline-none focus:ring-4 focus:ring-[#78a883]/20"
            >
              <Bell size={19} />
              {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#b45a44]" />}
            </button>
            {notificationsOpen && (
              <section role="dialog" aria-label="Notifications" className="absolute right-0 top-14 z-30 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-[#e1e7df] bg-white p-4 shadow-[0_18px_55px_rgba(26,45,31,.16)]">
                <div className="flex items-center justify-between">
                  <div><h2 className="font-display text-base font-extrabold">Notifications</h2><p className="mt-0.5 text-xs text-[#77847a]">{unreadCount} unread · mock feed</p></div>
                  <button type="button" onClick={markAllRead} className="rounded-lg px-2 py-1 text-xs font-bold text-[#42764d] hover:bg-[#eff6ee] focus:outline-none focus:ring-2 focus:ring-[#78a883]" data-testid="button-mark-notifications-read">Mark all read</button>
                </div>
                <div className="mt-3 divide-y divide-[#edf1ec]">
                  {notifications.map(item => (
                    <button key={item.id} type="button" onClick={() => markRead(item.id)} data-testid={`notification-${item.id}`} className="block w-full rounded-lg py-3 text-left hover:bg-[#f8faf7] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#78a883]">
                      <span className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.unread ? 'bg-[#b45a44]' : 'bg-[#d8dfd6]'}`} />
                        <span><span className="flex items-center justify-between gap-3 text-sm font-bold">{item.title}<span className="shrink-0 text-[10px] font-medium text-[#8a958b]">{item.time}</span></span><span className="mt-1 block text-xs leading-5 text-[#758178]">{item.detail}</span></span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 border-t border-[#edf1ec] pt-3 text-[10px] font-bold uppercase tracking-wider text-[#9b7840]">Demo notifications only</p>
              </section>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[#e9d9b5] bg-[#fff9eb] px-4 py-3 text-sm text-[#705b2d]" role="note" data-testid="status-demo-data">
          <span className="rounded-md bg-[#f1e4c3] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[.12em]">Demo only</span>
          <p><strong>Mock data workspace.</strong> Every value and activity on this page is illustrative and is not connected to live Estatehold, Paystack, escrow, or fraud records.</p>
          <span className="ml-auto font-mono-ui text-[10px] font-bold uppercase tracking-wider">dataSource='{dataSource}'</span>
        </div>

        <section aria-label="Executive summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total sales" value={money('₦86.4m')} detail="Illustrative gross value · today" icon={Activity} trend="+8.6%" />
          <MetricCard label="Reserved plots" value="128" detail="Across 11 demo developments" icon={Landmark} accent="gold" />
          <MetricCard label="Paystack collections" value={money('₦74.8m')} detail="Mock successful collections" icon={Wallet} accent="green" trend="+5.2%" />
          <MetricCard label="Paid out" value={money('₦52.1m')} detail="Mock completed disbursements" icon={ArrowUpRight} accent="ink" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.8fr)]">
          <article className="overflow-hidden rounded-2xl border border-[#e3e9e1] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#78857b]">Sales overview <span className="ml-1 text-[#b58b45]">· mock</span></p>
                <h2 className="mt-2 font-display text-[28px] font-extrabold tracking-[-.04em] sm:text-[32px]">₦{period === 'daily' ? '86.4' : '421.8'}m</h2>
                <p className="mt-1 text-xs text-[#77847a]">{period === 'daily' ? 'Today so far' : 'Year to date'} · illustrative sales value</p>
              </div>
              <div className="flex rounded-xl border border-[#e6ebe4] bg-[#f7f9f5] p-1" role="group" aria-label="Sales chart period">
                {(['daily', 'monthly'] as const).map(option => (
                  <button key={option} type="button" data-testid={`button-sales-${option}`} aria-pressed={period === option} onClick={() => setPeriod(option)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize transition ${period === option ? 'bg-[#193a25] text-white shadow-sm' : 'text-[#69766b] hover:bg-white'}`}>{option}</button>
                ))}
              </div>
            </div>
            <div className="mt-5 h-[240px] w-full" role="img" aria-label={`${period} mock sales trend chart, in millions of naira`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sales} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#65946b" stopOpacity={0.22} /><stop offset="95%" stopColor="#65946b" stopOpacity={0.015} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#edf1eb" strokeDasharray="3 5" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#89948b', fontSize: 10 }} dy={9} minTickGap={18} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#89948b', fontSize: 10 }} tickFormatter={value => `₦${value}m`} width={58} />
                  <Tooltip content={<SalesTooltip />} cursor={{ stroke: '#9db29d', strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="sales" stroke="#497b53" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 5, fill: '#345e3e', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-[#edf1ec] pt-3 text-[11px] text-[#7b887d]"><span>Sales value · ₦ millions</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#5e8b64]" />Demo trend</span></div>
          </article>

          <article className="flex flex-col rounded-2xl bg-[#193a25] p-5 text-[#f2f3e8] sm:p-6">
            <div className="flex items-start justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#aec3aa]">Funds in motion</p><h2 className="mt-2 font-display text-xl font-extrabold">Escrow & returns</h2></div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-[#d6e3c7]"><ShieldAlert size={19} /></span>
            </div>
            <div className="mt-5 divide-y divide-white/10">
              <div className="py-4 first:pt-0">
                <div className="flex items-center justify-between gap-2"><span className="text-sm text-[#c7d3c5]">7-day escrow hold</span><Clock3 size={15} className="text-[#a9c292]" /></div>
                <p className="mt-2 font-display text-2xl font-extrabold">₦18.6m</p>
                <p className="mt-1 text-[11px] text-[#a5b7a2]">27 demo transactions · held for review</p>
              </div>
              <div className="py-4">
                <div className="flex items-center justify-between gap-2"><span className="text-sm text-[#c7d3c5]">30-day fraud buffer</span><ShieldAlert size={15} className="text-[#d4b16b]" /></div>
                <p className="mt-2 font-display text-2xl font-extrabold">₦4.2m</p>
                <p className="mt-1 text-[11px] text-[#a5b7a2]">Reserve held against demo risk signals</p>
              </div>
              <div className="py-4 pb-0">
                <div className="flex items-center justify-between gap-2"><span className="text-sm text-[#c7d3c5]">Platform profit</span><ArrowUpRight size={15} className="text-[#a9c292]" /></div>
                <p className="mt-2 font-display text-2xl font-extrabold">₦12.7m</p>
                <p className="mt-1 text-[11px] text-[#a5b7a2]">Illustrative net platform margin</p>
              </div>
            </div>
            <div className="mt-auto pt-6 text-[10px] font-bold uppercase tracking-[.14em] text-[#a9bd9f]">All balances are simulated</div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
          <article className="rounded-2xl border border-[#e3e9e1] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#78857b]">Governance log</p><h2 className="mt-1 font-display text-xl font-extrabold">Recent admin activity</h2></div>
              <span className="rounded-full bg-[#f1f5ef] px-3 py-1.5 text-[10px] font-bold text-[#617365]">3 demo events</span>
            </div>
            <div className="mt-4 divide-y divide-[#edf1ec]">
              {activitySeed.map(item => (
                <div key={item.id} data-testid={`activity-${item.id}`} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${item.tone === 'green' ? 'bg-[#e4f0e4] text-[#3e7148]' : item.tone === 'gold' ? 'bg-[#f7efd9] text-[#96752f]' : 'bg-[#efe8ef] text-[#76576f]'}`}>{item.initials}</span>
                    <div className="min-w-0">
                      <p className="text-sm leading-5 text-[#344239]"><span className="font-bold">{item.person}</span> {item.action} <span className="font-bold text-[#1a3823]">{item.subject}</span></p>
                      <p className="mt-1 text-[11px] text-[#819087]">{item.time} <span className="px-1">·</span> IP <span className="font-mono-ui">{item.ip}</span></p>
                    </div>
                  </div>
                  <span className="ml-12 inline-flex w-fit items-center gap-1 rounded-full bg-[#edf6ec] px-2.5 py-1 text-[10px] font-bold text-[#397046] sm:ml-0"><Check size={12} /> Approved · mock</span>
                </div>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-2 rounded-xl bg-[#f7f9f6] px-3 py-2.5 text-[11px] leading-5 text-[#758278]"><ShieldAlert size={14} className="shrink-0 text-[#a17d37]" /> Demo audit entries only. IP addresses are fictional and partially masked.</p>
          </article>

          <article className="rounded-2xl border border-[#e3e9e1] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#9b624c]">Risk desk</p><h2 className="mt-1 font-display text-xl font-extrabold">Fraud alerts</h2></div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbefeb] px-3 py-1.5 text-[10px] font-bold text-[#a14f3e]"><CircleAlert size={12} /> {alerts.length} open · demo</span>
            </div>
            {alerts.length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {alerts.map(alert => (
                  <div key={alert.id} data-testid={`fraud-alert-${alert.id}`} className="rounded-xl border border-[#efe8e2] bg-[#fffdfa] p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-extrabold text-[#3b332e]">{alert.title}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${alert.severity === 'High' ? 'bg-[#f7e3dd] text-[#a34231]' : 'bg-[#f7efd9] text-[#8c6a2a]'}`}>{alert.severity}</span></div>
                        <p className="mt-1 text-xs leading-5 text-[#7d766d]">{alert.detail}</p>
                        <p className="mt-1.5 font-mono-ui text-[9px] uppercase tracking-wide text-[#9a8a79]">{alert.location} · mock</p>
                      </div>
                      <button type="button" aria-label={`Dismiss demo alert ${alert.id}`} data-testid={`button-dismiss-${alert.id}`} onClick={() => setAlerts(current => current.filter(item => item.id !== alert.id))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8a8279] hover:bg-[#f5eeea] hover:text-[#8c3d30] focus:outline-none focus:ring-2 focus:ring-[#b76a53]" title="Dismiss demo alert"><X size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#d8e3d7] bg-[#f8faf7] px-4 py-8 text-center" data-testid="empty-fraud-alerts">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#e8f3e8] text-[#44774d]"><Check size={18} /></span>
                <p className="mt-3 text-sm font-bold">Risk queue clear</p><p className="mt-1 text-xs text-[#7a877d]">You dismissed all illustrative alerts.</p>
              </div>
            )}
            <p className="mt-3 text-[10px] leading-4 text-[#9a8a79]">Alert patterns are fictional examples for interface demonstration only.</p>
          </article>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e9e1] pt-4 text-[10px] font-medium text-[#879289]">
          <span>Estatehold executive overview <span className="mx-1">·</span> Demo environment</span>
          <span className="inline-flex items-center gap-1.5"><ArrowDownRight size={12} /> No live account, payment, or risk data displayed</span>
        </footer>
      </div>
    </main>
  );
}

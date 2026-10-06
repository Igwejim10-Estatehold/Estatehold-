import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, useLocation, useRoute, Router as WouterRouter } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import {
  getGetAdminDashboardQueryKey, getGetDashboardQueryKey, getGetProfileQueryKey, getGetPublicConfigQueryKey,
  getGetPropertyQueryKey, getHealthCheckQueryKey, getListComplaintsQueryKey, getListPropertiesQueryKey,
  getListSocialHousingUnitsQueryKey, getListSpecialRequestsQueryKey, useCalculateFees, useCalculateInstallments,
  useCreateComplaint, useCreateProperty, useCreateSpecialRequest, useCreateTenancyAgreement, useGetAdminDashboard,
  useGetDashboard, useGetProfile, useGetProperty, useGetPublicConfig, useHealthCheck, useInitializePayment,
  useListComplaints, useListProperties, useListSocialHousingUnits, useListSpecialRequests, useReleaseEscrow,
  useRequestPropertyDelisting, useUpdateProfile,
} from '@workspace/api-client-react';
import type { ComplaintInput, FeeQuote, InstallmentQuote, ListSocialHousingUnits200, Property, Profile, ProfileInput, SpecialRequestInput } from '@workspace/api-client-react';
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, Building2, Calculator, Check, ChevronDown, ChevronRight,
  CircleAlert, Compass, FileCheck2, FileText, HeartHandshake, Home, Landmark, LifeBuoy,
  ListChecks, LoaderCircle, LockKeyhole, LogIn, MapPin, MessageSquareWarning, MoreHorizontal,
  Plus, Search, Shield, ShieldCheck, SlidersHorizontal, Wallet,
} from 'lucide-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const routes = [
  ['/browse', 'Explore homes', Search], ['/map', 'Map search', MapPin], ['/list-property', 'List a property', Plus],
  ['/request-property', 'Find a property', Compass], ['/requests', 'My requests', ListChecks],
  ['/social-housing', 'Shared ownership', HeartHandshake], ['/complaints/new', 'Report an issue', LifeBuoy],
  ['/wallet', 'Wallet & checkout', Wallet], ['/installment-calculator', 'Installment planner', Calculator],
  ['/profile', 'My profile', BadgeCheck], ['/poa/landlord', 'Landlord POA draft', FileText],
  ['/poa/tenant', 'Tenant POA draft', FileCheck2], ['/recovery', 'Property recovery', Shield],
  ['/tenancy-agreement', 'Tenancy agreement', FileText], ['/admin', 'Operations desk', Activity],
] as const;
const money = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? `₦${new Intl.NumberFormat('en-NG').format(value)}` : '—';
const timeGreeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};
function LogoMark({ small = false }: { small?: boolean }) {
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${small ? 'h-8 w-8' : 'h-10 w-10'}`} aria-label="Estatehold logo">
    <img src="/Public/estatehold-logo.png" alt="Estatehold logo" className="h-full w-full object-contain" draggable={false}/>
  </span>;
}
function Field({ label, name, type = 'text', placeholder, required = false, defaultValue, min, step, readOnly = false }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean; defaultValue?: string | number; min?: number; step?: number; readOnly?: boolean;
}) {
  return <label className="block text-sm font-semibold text-[#304039]">{label}<input data-testid={`input-${name}`} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} min={min} step={step} readOnly={readOnly}
    className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal text-[#17211b] outline-none transition focus:border-[#16A34A] focus:ring-4 focus:ring-[#16A34A]/10" /></label>;
}
function SelectField({ label, name, options, defaultValue }: { label: string; name: string; options: Array<[string, string]>; defaultValue?: string }) {
  return <label className="block text-sm font-semibold text-[#304039]">{label}<select data-testid={`input-${name}`} name={name} defaultValue={defaultValue} className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal text-[#17211b] outline-none focus:border-[#16A34A]">
    {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}
function TextArea({ label, name, placeholder, required = false }: { label: string; name: string; placeholder?: string; required?: boolean }) {
  return <label className="block text-sm font-semibold text-[#304039]">{label}<textarea data-testid={`input-${name}`} name={name} required={required} placeholder={placeholder} rows={4}
    className="mt-2 block w-full resize-y rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal text-[#17211b] outline-none focus:border-[#16A34A] focus:ring-4 focus:ring-[#16A34A]/10" /></label>;
}
function Button({ children, onClick, type = 'button', variant = 'primary', disabled = false, testId }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; variant?: 'primary' | 'light' | 'outline' | 'danger'; disabled?: boolean; testId?: string }) {
  const cls = variant === 'primary' ? 'bg-[#0B0F0E] text-white hover:bg-[#1a2921]' : variant === 'light' ? 'bg-[#e8f5e9] text-[#126a32] hover:bg-[#d8efda]' : variant === 'danger' ? 'bg-[#a63030] text-white' : 'border border-[#dce5dd] bg-white text-[#1b2a21] hover:bg-[#f5f8f4]';
  return <button data-testid={testId} type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 ${cls}`}>{children}</button>;
}
function LoadingCard() { return <div className="animate-pulse rounded-2xl border border-[#e5ebe4] bg-white p-5"><div className="h-4 w-1/3 rounded bg-[#edf2ed]"/><div className="mt-4 h-6 w-2/3 rounded bg-[#edf2ed]"/><div className="mt-5 h-32 rounded-xl bg-[#edf2ed]"/></div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="rounded-2xl border border-[#f0d2cf] bg-[#fff8f6] p-6 text-[#853b32]"><div className="flex items-center gap-2 font-bold"><CircleAlert size={18}/> We couldn’t load this right now.</div><p className="mt-1 text-sm text-[#855c56]">Check your connection and try again.</p><button onClick={onRetry} className="mt-4 text-sm font-bold underline">Try again</button></div>; }
function EmptyState({ icon: Icon = Home, title, body, action }: { icon?: typeof Home; title: string; body: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#cbd8cb] bg-[#fbfcf9] px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f5e9] text-[#16843d]"><Icon size={22}/></div><h3 className="mt-4 font-display text-xl font-extrabold">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6a786e]">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
function Notice({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'amber' ? 'border-[#ebd9af] bg-[#fff9e9] text-[#755d21]' : tone === 'red' ? 'border-[#f0d2cf] bg-[#fff8f6] text-[#853b32]' : 'border-[#cae7d0] bg-[#f1faf2] text-[#27643b]';
  return <div className={`flex gap-3 rounded-2xl border p-4 text-sm leading-6 ${color}`}><ShieldCheck className="mt-0.5 shrink-0" size={18}/><div>{children}</div></div>;
}
function PropertyCard({ property }: { property: Property }) {
  return <Link href={`/property/${property.id}`} className="group overflow-hidden rounded-2xl border border-[#e4eae3] bg-white transition-transform hover:-translate-y-1 hover:shadow-lg hover:shadow-[#1d3523]/[.06]" data-testid={`card-property-${property.id}`}>
    <div className="relative h-48 overflow-hidden bg-[#e9eee8]">{property.imageUrl ? <img src={property.imageUrl} alt={property.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"/> :
      <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_75%_16%,#d3e6d4,transparent_38%),linear-gradient(135deg,#edf3e9,#dce8de)]"><Building2 size={46} strokeWidth={1.2} className="text-[#7e9984]"/></div>}
      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-[#31513a]">{property.intent === 'rent' ? 'For rent' : property.intent === 'social' ? 'Shared home' : 'For sale'}</span>
      <span className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${property.pinStatus === 'verified' || property.pinStatus === 'tenant_protected' ? 'bg-[#e8f5e9] text-[#1d7938]' : property.pinStatus === 'dispute' ? 'bg-[#fff0ec] text-[#9a4436]' : 'bg-white text-[#64756a]'}`}><MapPin size={12}/>{property.pinStatus === 'verified' ? 'Location verified' : property.pinStatus === 'tenant_protected' ? 'Tenant protected' : property.pinStatus === 'dispute' ? 'Pin disputed' : 'Pin pending'}</span>
      {property.isLocked && <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-[#0B0F0E]/85 px-2.5 py-1 text-[11px] font-bold text-white"><LockKeyhole size={11}/>Locked listing</span>}
    </div>
    <div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-[17px] font-extrabold leading-snug">{property.title}</h3><span className="shrink-0 text-xs text-[#78847b]">{property.bedrooms ? `${property.bedrooms} bed` : ''}</span></div>
      <p className="mt-1 flex items-center gap-1 text-sm text-[#718077]"><MapPin size={13}/>{property.town}, {property.state}</p>
      <div className="mt-4 flex items-end justify-between"><p className="font-display text-lg font-extrabold">{money(property.priceNaira)}<span className="ml-1 font-sans text-xs font-medium text-[#77847a]">{property.priceUnit || (property.intent === 'rent' ? '/ year' : '')}</span></p><span className="text-xs font-semibold text-[#67816c]">{property.isManaged ? 'Managed' : 'Direct'}</span></div>
    </div>
  </Link>;
}
function AppContent() {
  const [location, navigate] = useLocation();
  const [propertyRoute, propertyRouteParams] = useRoute('/property/:id');
  const [mobileMore, setMobileMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [authSession, setAuthSession] = useState<{ access_token: string; user?: { email?: string } } | null>(() => {
    try { const raw = localStorage.getItem('estatehold-session'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const queryClient = useQueryClient();
  const config = useGetPublicConfig({ query: { queryKey: getGetPublicConfigQueryKey() } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const dashboard = useGetDashboard({ query: { enabled: location === '/', queryKey: getGetDashboardQueryKey() } });
  const profile = useGetProfile({ query: { enabled: !!authSession || location === '/profile', queryKey: getGetProfileQueryKey() } });
  const propertyFilters = useMemo(() => ({ town: profile.data?.town || undefined }), [profile.data?.town]);
  const propertiesQuery = useListProperties(propertyFilters, { query: { enabled: ['/','/browse','/map','/tenancy-agreement'].includes(location), queryKey: getListPropertiesQueryKey(propertyFilters) } });
  const socialQuery = useListSocialHousingUnits({ query: { enabled: location === '/social-housing', queryKey: getListSocialHousingUnitsQueryKey() } });
  const requestsQuery = useListSpecialRequests({ query: { enabled: ['/requests','/admin'].includes(location), queryKey: getListSpecialRequestsQueryKey() } });
  const complaintsQuery = useListComplaints({ query: { enabled: ['/admin'].includes(location), queryKey: getListComplaintsQueryKey() } });
  const adminQuery = useGetAdminDashboard({ query: { enabled: location === '/admin', queryKey: getGetAdminDashboardQueryKey() } });
  const singleProperty = useGetProperty(propertyRouteParams?.id || '', { query: { enabled: !!propertyRoute && !!propertyRouteParams?.id, queryKey: getGetPropertyQueryKey(propertyRouteParams?.id || '') } });
  const createProperty = useCreateProperty();
  const createRequest = useCreateSpecialRequest();
  const createComplaint = useCreateComplaint();
  const updateProfile = useUpdateProfile();
  const calculateFees = useCalculateFees();
  const calculateInstallments = useCalculateInstallments();
  const initializePayment = useInitializePayment();
  const createAgreement = useCreateTenancyAgreement();
  const delisting = useRequestPropertyDelisting();
  const releaseEscrow = useReleaseEscrow();
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);
  const [installmentQuote, setInstallmentQuote] = useState<InstallmentQuote | null>(null);
  const [paymentResult, setPaymentResult] = useState<{ reference: string; authorizationUrl: string; mode: string } | null>(null);
  const [createdAgreement, setCreatedAgreement] = useState<{ id: string; reviewNotice: string } | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => { setAuthTokenGetter(() => authSession?.access_token || null); return () => setAuthTokenGetter(null); }, [authSession]);
  useEffect(() => {
    if (config.data?.googleMapsApiKey && !document.getElementById('estatehold-maps')) {
      const script = document.createElement('script'); script.id = 'estatehold-maps';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.data.googleMapsApiKey)}`; script.async = true; document.head.appendChild(script);
    }
  }, [config.data?.googleMapsApiKey]);
  useEffect(() => { setNotice(''); }, [location]);
  const items = dashboard.data?.items || propertiesQuery.data?.items || [];
  const filteredProperties = useMemo(() => propertiesQuery.data?.items || [], [propertiesQuery.data]);
  const profileTown = profile.data?.town || dashboard.data?.location || 'your area';
  const submitWith = (handler: (data: FormData) => void) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); handler(new FormData(event.currentTarget));
  };
  const refresh = (key: readonly unknown[]) => queryClient.invalidateQueries({ queryKey: key });
  const statusMessage = (message: string) => { setNotice(message); };
  const submitAuth = async (event: FormEvent<HTMLFormElement>, mode: 'sign-in' | 'sign-up') => {
    event.preventDefault(); setAuthError('');
    const fd = new FormData(event.currentTarget); const email = String(fd.get('email') || ''); const password = String(fd.get('password') || '');
    if (!config.data?.supabaseUrl || !config.data.supabaseAnonKey) { setAuthError('Authentication configuration is not available yet. Please retry in a moment.'); return; }
    try {
      const endpoint = mode === 'sign-in' ? '/auth/v1/token?grant_type=password' : '/auth/v1/signup';
      const response = await fetch(`${config.data.supabaseUrl.replace(/\/$/,'')}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type':'application/json', apikey: config.data.supabaseAnonKey },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.msg || result.message || result.error_description || 'Unable to authenticate.');
      if (!result.access_token) { setNotice('Check your email to finish confirming your Estatehold account.'); navigate('/sign-in'); return; }
      setAuthSession(result); localStorage.setItem('estatehold-session', JSON.stringify(result)); navigate('/'); refresh(getGetProfileQueryKey());
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to authenticate.'); }
  };
  const logout = () => { localStorage.removeItem('estatehold-session'); setAuthSession(null); statusMessage('You have signed out.'); };
  const shellRoutes = ['/sign-in','/sign-up'];
  const routeTitle = routes.find(([path]) => path === location)?.[1] || '';
  const submitProperty = (fd: FormData) => {
    const input = {
      title: String(fd.get('title')), category: String(fd.get('category')) as Property['category'], customType: String(fd.get('customType') || '') || undefined,
      state: String(fd.get('state')), town: String(fd.get('town')), address: String(fd.get('address') || '') || undefined, description: String(fd.get('description') || '') || undefined,
      priceNaira: Number(fd.get('priceNaira')), priceUnit: String(fd.get('priceUnit') || '') || undefined, intent: String(fd.get('intent')) as Property['intent'],
      bedrooms: Number(fd.get('bedrooms')) || undefined, bathrooms: Number(fd.get('bathrooms')) || undefined, sizeSqm: Number(fd.get('sizeSqm')) || undefined,
      latitude: Number(fd.get('latitude')) || 0, longitude: Number(fd.get('longitude')) || 0, imageUrl: String(fd.get('imageUrl') || '') || undefined, premisesRulesUrl: String(fd.get('premisesRulesUrl') || '') || undefined,
    };
    createProperty.mutate({ data: input }, { onSuccess: result => { refresh(getListPropertiesQueryKey(propertyFilters)); refresh(getGetDashboardQueryKey()); statusMessage('Listing submitted. Its location pin will remain marked pending until verified.'); navigate(`/property/${result.id}`); } });
  };
  const submitRequest = (fd: FormData) => {
    const input: SpecialRequestInput = {
      requestType: String(fd.get('requestType')) as SpecialRequestInput['requestType'], customCategory: String(fd.get('customCategory') || '') || undefined,
      desiredTown: String(fd.get('desiredTown')), desiredLga: String(fd.get('desiredLga')), desiredState: String(fd.get('desiredState')), neighborhood: String(fd.get('neighborhood') || '') || undefined,
      budgetNaira: Number(fd.get('budgetNaira')), urgency: String(fd.get('urgency')) as SpecialRequestInput['urgency'],
    };
    createRequest.mutate({ data: input }, { onSuccess: () => { refresh(getListSpecialRequestsQueryKey()); statusMessage('Your sourcing request is now in the tracking queue.'); navigate('/requests'); } });
  };
  const submitProfile = (fd: FormData) => {
    const input: ProfileInput = {
      role: String(fd.get('role')) as ProfileInput['role'], fullName: String(fd.get('fullName')), phone: String(fd.get('phone') || ''),
      country: 'Nigeria', state: String(fd.get('state')), lga: String(fd.get('lga') || ''), town: String(fd.get('town')),
      villageOfOrigin: String(fd.get('villageOfOrigin') || '') || undefined, nbaSealNumber: String(fd.get('nbaSealNumber') || '') || undefined,
      bankName: String(fd.get('bankName') || '') || undefined, bankAccountLast4: String(fd.get('bankAccountLast4') || '') || undefined,
    };
    updateProfile.mutate({ data: input }, { onSuccess: () => { refresh(getGetProfileQueryKey()); statusMessage('Your profile details have been saved.'); } });
  };
  const content = () => {
    if (propertyRoute) {
      const p = singleProperty.data;
      return <div className="space-y-6">{singleProperty.isLoading ? <LoadingCard/> : singleProperty.isError ? <ErrorState onRetry={() => singleProperty.refetch()}/> : !p ? <EmptyState title="Listing unavailable" body="This property could not be found."/> :
        <><button onClick={() => navigate('/browse')} className="inline-flex items-center gap-2 text-sm font-bold text-[#486450]"><ArrowLeft size={16}/>Back to explore</button>
          <div className="grid gap-7 lg:grid-cols-[1fr_360px]"><div className="overflow-hidden rounded-3xl border border-[#e4eae3] bg-white">
            {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="h-[360px] w-full object-cover"/> : <div className="flex h-[360px] items-center justify-center bg-[radial-gradient(ellipse_at_75%_16%,#d3e6d4,transparent_38%),linear-gradient(135deg,#edf3e9,#dce8de)]"><Building2 size={76} strokeWidth={1.1} className="text-[#7e9984]"/></div>}
            <div className="p-6 sm:p-8"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-xs font-bold text-[#26723a]">{p.pinStatus.replace('_',' ')}</span>{p.isExclusive && <span className="rounded-full bg-[#f7efd9] px-3 py-1 text-xs font-bold text-[#80611e]">Exclusive listing</span>}</div>
              <h1 className="mt-4 font-display text-3xl font-extrabold sm:text-4xl">{p.title}</h1><p className="mt-2 flex items-center gap-1.5 text-[#758078]"><MapPin size={16}/>{p.address ? `${p.address}, ` : ''}{p.town}, {p.state}</p>
              <div className="my-6 grid grid-cols-3 gap-3 border-y border-[#e9eee8] py-5 text-sm">{[[p.bedrooms ? `${p.bedrooms} bedrooms` : '—','Bedrooms'],[p.bathrooms ? `${p.bathrooms} bathrooms` : '—','Bathrooms'],[p.sizeSqm ? `${p.sizeSqm} m²` : '—','Floor area']].map(([v,k])=><div key={k}><b className="block text-base">{v}</b><span className="text-xs text-[#758078]">{k}</span></div>)}</div>
              <h2 className="font-display text-xl font-extrabold">About this property</h2><p className="mt-2 whitespace-pre-line leading-7 text-[#627067]">{p.description || 'No description has been supplied for this listing.'}</p>
              <div className="mt-6"><Notice>Estatehold checks location pins and makes tenant-protection status visible. Always inspect and confirm terms before making a commitment.</Notice></div>
              {p.premisesRulesUrl && <a href={p.premisesRulesUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#28763d]"><FileText size={15}/>View premises rules</a>}</div></div>
            <aside className="h-fit rounded-3xl border border-[#e3e9e2] bg-white p-6"><p className="font-display text-3xl font-extrabold">{money(p.priceNaira)}</p><p className="mt-1 text-sm text-[#748077]">{p.priceUnit || (p.intent === 'rent' ? 'per year' : p.intent)}</p>
              <div className="mt-5 space-y-3"><Link href="/wallet" className="flex min-h-12 items-center justify-center rounded-xl bg-[#0B0F0E] px-4 text-sm font-bold text-white">Review fees & checkout</Link><Link href="/tenancy-agreement" className="flex min-h-12 items-center justify-center rounded-xl border border-[#dfe7df] px-4 text-sm font-bold">Prepare tenancy draft</Link></div>
              <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-[#718077]"><LockKeyhole size={14}/>Payments stay in test mode. Escrow release is disabled pending compliance approval.</p>
              <Button variant="outline" onClick={() => { if (confirm('Request an operations review to delist this property?')) delisting.mutate({ propertyId: p.id }, { onSuccess: () => { refresh(getGetPropertyQueryKey(p.id)); refresh(getListPropertiesQueryKey(propertyFilters)); refresh(getGetDashboardQueryKey()); statusMessage('Delisting review requested.') } }); }} disabled={delisting.isPending} testId="button-request-delist" >{delisting.isPending ? 'Sending…' : 'Request review to delist'}</Button>
            </aside></div></>}
      </div>;
    }
    switch (location) {
      case '/': {
        const greeting = timeGreeting();
        return <div className="space-y-8">
          <section className="relative overflow-hidden rounded-[28px] bg-[#0B0F0E] px-6 py-8 text-[#f5f6f1] sm:px-10 sm:py-10">
            <div className="absolute -right-10 -top-20 h-80 w-80 rounded-full border border-[#32553c]/60"/><div className="absolute -right-1 top-[-40px] h-64 w-64 rounded-full border border-[#32553c]/40"/><div className="absolute bottom-[-100px] right-[22%] h-64 w-64 rounded-full bg-[#16A34A]/10 blur-3xl"/>
            <div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-[#b6d6bc]"><MapPin size={13}/>{profileTown}</span>
              <p className="mt-7 text-sm font-medium text-[#adc0b0]">{greeting}</p><h1 className="mt-1 font-display text-4xl font-extrabold leading-[1.08] tracking-[-.04em] sm:text-6xl">A home should<br/><span className="text-[#82cf91]">feel certain.</span></h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#c2ccc3]">Find a place with a location you can trust—and protection you can see.</p>
              <div className="mt-7 flex flex-wrap gap-3"><Link href="/browse" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#16A34A] px-5 text-sm font-bold text-white hover:bg-[#15803d]">Explore properties <ArrowRight size={16}/></Link><Link href="/map" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-bold text-white hover:bg-white/10"><MapPin size={16}/>Open map</Link></div>
              <div className="mt-8 flex items-center gap-2 text-xs text-[#aab9ac]"><ShieldCheck size={15} className="text-[#82cf91]"/>Verified location pins · Visible tenant safeguards</div>
            </div>
          </section>
          {notice && <Notice>{notice}</Notice>}
          <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#65806a]">A clear next step</p><h2 className="mt-1 font-display text-2xl font-extrabold">What brings you here?</h2></div><span className="hidden text-sm text-[#77847a] sm:block">Built for the real Nigerian property journey</span></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[
              ['/browse','Find a home','Browse location-verified listings',Search,'#e8f5e9'],['/request-property','Source a property','Tell us what you need',Compass,'#f7efe0'],['/wallet','Know the costs','Fees before you commit',Wallet,'#eaf0f6'],['/complaints/new','Get support','Raise a property concern',LifeBuoy,'#f5e9e7'],
            ].map(([href,label,desc,Icon,bg])=>{const I=Icon as typeof Home;return <Link key={String(href)} href={String(href)} className="group rounded-2xl border border-[#e4eae3] bg-white p-4 transition-transform hover:-translate-y-1 hover:shadow-md sm:p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl text-[#206d38]" style={{background:bg as string}}><I size={19}/></div><h3 className="mt-4 font-display text-base font-extrabold">{String(label)}</h3><p className="mt-1 text-xs leading-5 text-[#748077]">{String(desc)}</p><ArrowRight size={15} className="mt-3 text-[#69816e] transition-transform group-hover:translate-x-1"/></Link>})}</div>
          </section>
          <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#65806a]">Near {profileTown}</p><h2 className="mt-1 font-display text-2xl font-extrabold">A few places to begin</h2></div><Link href="/browse" className="text-sm font-bold text-[#26723a]">See all <ArrowRight className="ml-1 inline" size={14}/></Link></div>
            {dashboard.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><LoadingCard/><LoadingCard/><LoadingCard/></div> : dashboard.isError ? <ErrorState onRetry={() => dashboard.refetch()}/> : items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.slice(0,3).map(p=><PropertyCard key={p.id} property={p}/>)}</div> : <EmptyState title="Good places start with a search" body="No property matches are showing yet. Browse to explore current verified listings." action={<Link href="/browse" className="font-bold text-[#18783a]">Explore the marketplace <ArrowRight className="ml-1 inline" size={15}/></Link>}/>}
          </section>
          <section className="grid gap-4 md:grid-cols-[1.3fr_.7fr]"><div className="flex flex-col justify-between rounded-3xl bg-[#e8f5e9] p-6 sm:p-8"><div><span className="font-mono-ui text-[11px] font-bold uppercase tracking-[.16em] text-[#39734a]">A fairer way to get the keys</span><h2 className="mt-3 max-w-lg font-display text-3xl font-extrabold leading-tight">Small beginnings.<br/>A home of your own.</h2><p className="mt-3 max-w-md text-sm leading-6 text-[#54725a]">Explore shared housing units designed to make ownership more reachable.</p></div><Link href="/social-housing" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#1e7138]">Discover shared ownership <ArrowRight size={15}/></Link></div>
            <div className="flex flex-col justify-between rounded-3xl border border-[#e4eae3] bg-white p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4f1e8] text-[#8d7132]"><ShieldCheck size={20}/></div><h3 className="mt-6 font-display text-xl font-extrabold">Your rights, in plain sight.</h3><p className="mt-2 text-sm leading-6 text-[#6e7c72]">A clear route to report concerns, review agreements and request recovery guidance.</p><Link href="/recovery" className="mt-5 text-sm font-bold text-[#26723a]">See protection options <ArrowRight className="ml-1 inline" size={14}/></Link></div>
          </section>
        </div>;
      }
      case '/browse': {
        return <BrowsePage query={propertiesQuery} properties={filteredProperties} profileTown={profileTown} onRetry={() => propertiesQuery.refetch()}/>;
      }
      case '/map': {
        const apiKey = config.data?.googleMapsApiKey;
        return <div className="space-y-5"><PageIntro eyebrow="Search by place" title="Explore the map" text="See what’s listed around the places that matter to you."/>
          {propertiesQuery.isLoading ? <LoadingCard/> : propertiesQuery.isError ? <ErrorState onRetry={() => propertiesQuery.refetch()}/> : !filteredProperties.length ? <EmptyState icon={MapPin} title="No mapped properties yet" body="Property pins will appear here when listings are available."/> :
          <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><div className="relative min-h-[430px] overflow-hidden rounded-3xl border border-[#dce5dd] bg-[#e8eee5]">
            {apiKey && filteredProperties.find(p=>typeof p.latitude==='number'&&typeof p.longitude==='number') ? <iframe title="Google Maps property search" className="absolute inset-0 h-full w-full border-0" loading="lazy" src={`https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(apiKey)}&center=${filteredProperties.find(p=>typeof p.latitude==='number'&&typeof p.longitude==='number')!.latitude},${filteredProperties.find(p=>typeof p.latitude==='number'&&typeof p.longitude==='number')!.longitude}&zoom=12&maptype=roadmap`}/> :
            <div className="absolute inset-0 bg-[linear-gradient(28deg,transparent_47%,#fff9_48%,#fff9_49%,transparent_50%),linear-gradient(148deg,transparent_45%,#fff9_46%,#fff9_47%,transparent_48%),linear-gradient(90deg,#dce9dd,#e8eee5)]"><div className="absolute inset-0 opacity-40" style={{backgroundImage:'radial-gradient(#8db49a 1px, transparent 1px)',backgroundSize:'21px 21px'}}/><div className="absolute left-4 top-4 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold shadow"><MapPin size={14} className="mr-1 inline text-[#16A34A]"/>{apiKey?'A listing needs coordinates to map':'Google Maps key unavailable'}</div></div>}
          </div><div className="space-y-3">{filteredProperties.slice(0,5).map(p=><PropertyCard key={p.id} property={p}/>)}</div></div>}</div>;
      }
      case '/list-property':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="For owners & agents" title="Add a property" text="Share accurate details. Location verification makes the listing clearer for everyone."/><Notice>Your pin location is part of the listing review. Use the property’s real coordinates; new pins show as pending until verified.</Notice>
          <form onSubmit={submitWith(submitProperty)} className="space-y-5 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Listing title" name="title" required placeholder="e.g. Two-bedroom apartment near..." /><SelectField label="Property type" name="category" options={[['home','Home'],['land','Land'],['warehouse','Warehouse'],['complex','Complex'],['shopping_mall','Shopping mall'],['hotel','Hotel'],['school','School'],['hospital','Hospital'],['filling_station','Filling station'],['multipurpose_hall','Multipurpose hall'],['custom','Other / custom']]} />
              <Field label="Custom property type (optional)" name="customType" placeholder="Describe the type"/><SelectField label="Listing intent" name="intent" options={[['sale','For sale'],['rent','For rent'],['social','Shared housing']]} />
              <Field label="State" name="state" required placeholder="Lagos"/><Field label="Town / city" name="town" required placeholder="Ikeja"/><Field label="Street address" name="address" placeholder="Street, estate or landmark"/><Field label="Price in naira" name="priceNaira" type="number" min={1} required placeholder="0"/><Field label="Price unit" name="priceUnit" placeholder="per year, total…"/><Field label="Bedrooms" name="bedrooms" type="number" min={0}/><Field label="Bathrooms" name="bathrooms" type="number" min={0}/><Field label="Size (m²)" name="sizeSqm" type="number" min={0}/><Field label="Latitude" name="latitude" type="number" step={0.000001} required placeholder="6.5244"/><Field label="Longitude" name="longitude" type="number" step={0.000001} required placeholder="3.3792"/><Field label="Image URL (optional)" name="imageUrl" placeholder="https://…"/><Field label="Premises rules URL (optional)" name="premisesRulesUrl" placeholder="https://…"/></div>
            <TextArea label="Description" name="description" placeholder="Share the details a renter or buyer should know."/>
            {createProperty.isError && <Notice tone="red">The listing could not be submitted. Please review the fields and try again.</Notice>}
            <Button type="submit" disabled={createProperty.isPending} testId="button-submit-property">{createProperty.isPending ? <><LoaderCircle className="animate-spin" size={16}/>Saving listing…</> : 'Submit for listing review'}</Button>
          </form></div>;
      case '/request-property':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="We’ll help you look" title="Request a property" text="Set the budget and location you’re working with. Track your request from one place."/>
          <form onSubmit={submitWith(submitRequest)} className="grid gap-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:grid-cols-2 sm:p-8"><SelectField label="Request type" name="requestType" options={[['location_sourcing','Find a property in a location'],['custom_category','Find a specific property type']]}/><Field label="Custom category" name="customCategory" placeholder="e.g. Accessible bungalow"/><Field label="Preferred town" name="desiredTown" required placeholder="Ikeja"/><Field label="LGA" name="desiredLga" required placeholder="Ikeja"/><Field label="State" name="desiredState" required placeholder="Lagos"/><Field label="Neighborhood (optional)" name="neighborhood" placeholder="Near a school, bus route…"/><Field label="Budget (₦)" name="budgetNaira" type="number" required min={1} placeholder="Your budget"/><SelectField label="Urgency" name="urgency" options={[['standard','Standard'],['urgent','Urgent']]}/>
            {createRequest.isError && <div className="sm:col-span-2"><Notice tone="red">Request didn’t send. Check required fields and retry.</Notice></div>}<div className="sm:col-span-2"><Button type="submit" disabled={createRequest.isPending}>{createRequest.isPending ? 'Sending request…' : 'Send sourcing request'} <ArrowRight size={15}/></Button></div></form></div>;
      case '/requests':
        return <div className="space-y-6"><PageIntro eyebrow="Stay in the loop" title="Your property requests" text="Follow sourcing requests as they move from open to assigned and sourced."/><div className="flex justify-end"><Link href="/request-property" className="inline-flex items-center gap-2 rounded-xl bg-[#0B0F0E] px-4 py-3 text-sm font-bold text-white"><Plus size={16}/>New request</Link></div>
          {requestsQuery.isLoading ? <div className="grid gap-3"><LoadingCard/><LoadingCard/></div> : requestsQuery.isError ? <ErrorState onRetry={() => requestsQuery.refetch()}/> : requestsQuery.data?.items.length ? <div className="space-y-3">{requestsQuery.data.items.map(r=><article key={r.id} className="rounded-2xl border border-[#e4eae3] bg-white p-5 sm:flex sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-xs font-bold capitalize text-[#26723a]">{r.status}</span><span className="text-xs text-[#748077]">{r.urgency === 'urgent' ? 'Priority request' : 'Standard request'}</span></div><h2 className="mt-3 font-display text-lg font-extrabold">{r.desiredTown}, {r.desiredState}</h2><p className="mt-1 text-sm text-[#718077]">{r.neighborhood || r.desiredLga} · Budget up to {money(r.budgetNaira)}</p></div><span className="mt-3 text-xs text-[#78847b] sm:mt-0">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Date not provided'}</span></article>)}</div> : <EmptyState icon={ListChecks} title="Nothing to track yet" body="Your requests will appear here after you submit a property sourcing brief." action={<Link href="/request-property" className="font-bold text-[#18783a]">Create a request</Link>}/>}</div>;
      case '/social-housing':
        return <SocialHousingPage query={socialQuery}/>;
      case '/complaints/new':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="Tenant protection" title="Lodge a complaint" text="Tell us what happened. Your submission will enter the appropriate review queue."/><Notice>Describe the issue clearly and include only evidence links you’re comfortable sharing. Estatehold does not replace emergency services or legal advice.</Notice>
          <form onSubmit={submitWith(fd=>{
            const input: ComplaintInput = { against: String(fd.get('against')) as ComplaintInput['against'], complaintType: String(fd.get('complaintType')) as ComplaintInput['complaintType'], description: String(fd.get('description')), propertyId: String(fd.get('propertyId') || '') || undefined, evidenceUrls: String(fd.get('evidenceUrls') || '').split(',').map(s=>s.trim()).filter(Boolean) };
            createComplaint.mutate({data:input},{onSuccess:()=>{refresh(getListComplaintsQueryKey());statusMessage('Complaint lodged for review.');navigate('/');}});
          })} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-8"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Complaint concerns" name="against" options={[['landlord','Landlord'],['agent','Agent'],['tenant','Tenant'],['attorney','Attorney']]}/><SelectField label="Issue type" name="complaintType" options={[['harassment','Harassment'],['agent_misconduct','Agent misconduct'],['breach_of_rules','Breach of rules'],['service_failure','Service failure']]}/><Field label="Property ID (optional)" name="propertyId" placeholder="Listing reference"/><Field label="Evidence URLs (comma separated)" name="evidenceUrls" placeholder="https://…"/></div><TextArea label="What happened?" name="description" required placeholder="Include dates, key details and what resolution you are seeking."/>
            {createComplaint.isError && <Notice tone="red">We couldn’t lodge this complaint. Please try again.</Notice>}<Button type="submit" disabled={createComplaint.isPending}>{createComplaint.isPending ? 'Submitting…' : 'Submit complaint'} <ArrowRight size={15}/></Button></form></div>;
      case '/wallet':
        return <WalletPage quote={feeQuote} onQuote={setFeeQuote} calc={calculateFees} payment={initializePayment} paymentResult={paymentResult} setPayment={setPaymentResult} />;
      case '/installment-calculator':
        return <InstallmentPage quote={installmentQuote} onQuote={setInstallmentQuote} calc={calculateInstallments}/>;
      case '/profile':
        return <ProfilePage profile={profile} updateProfile={updateProfile} onSubmit={submitProfile} authSession={authSession} onLogout={logout}/>;
      case '/poa/landlord':
      case '/poa/tenant':
        return <PoaPage tenant={location.includes('tenant')}/>;
      case '/recovery':
        return <RecoveryPage/>;
      case '/tenancy-agreement':
        return <AgreementPage properties={propertiesQuery.data?.items || dashboard.data?.items || []} mutation={createAgreement} result={createdAgreement} onResult={setCreatedAgreement}/>;
      case '/admin':
        return <div className="space-y-6"><PageIntro eyebrow="Operations" title="Review desk" text="Operational queues and compliance controls. Access is governed by your Estatehold role."/><Notice tone="amber">Escrow release remains disabled pending compliance approval, regardless of queue status.</Notice>
          {adminQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><LoadingCard/><LoadingCard/><LoadingCard/></div> : adminQuery.isError ? <ErrorState onRetry={() => adminQuery.refetch()}/> : adminQuery.data && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Pending KYC',adminQuery.data.pendingKyc,BadgeCheck],['Delisting reviews',adminQuery.data.pendingDelistings,Building2],['Open complaints',adminQuery.data.openComplaints,MessageSquareWarning],['Held escrows',adminQuery.data.heldEscrows,LockKeyhole],['Open sourcing requests',adminQuery.data.openRequests,Compass],['Attorney reviews',adminQuery.data.attorneyReviews,FileCheck2]].map(([name,count,Icon])=>{const I=Icon as typeof Home; return <div key={String(name)} className="rounded-2xl border border-[#e4eae3] bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#65746a]">{String(name)}</span><I size={18} className="text-[#16A34A]"/></div><p className="mt-3 font-display text-3xl font-extrabold">{String(count)}</p></div>})}</div>}
          <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Complaint queue</h2>{complaintsQuery.isLoading ? <div className="mt-4"><LoadingCard/></div> : complaintsQuery.isError ? <div className="mt-4"><ErrorState onRetry={()=>complaintsQuery.refetch()}/></div> : complaintsQuery.data?.items.length ? <div className="mt-4 divide-y divide-[#edf1ec]">{complaintsQuery.data.items.map(c=><div key={c.id} className="py-3"><div className="flex justify-between"><b className="text-sm capitalize">{c.complaintType.replaceAll('_',' ')}</b><span className="text-xs capitalize text-[#66766a]">{c.status}</span></div><p className="mt-1 line-clamp-2 text-sm text-[#718077]">{c.description}</p></div>)}</div> : <p className="mt-4 text-sm text-[#718077]">No complaints in this view.</p>}</section>
            <section className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Held escrow</h2><p className="mt-1 text-sm text-[#718077]">Release actions stay locked until compliance approval.</p><form className="mt-4 flex gap-2" onSubmit={e=>{e.preventDefault();const id=String(new FormData(e.currentTarget).get('transactionId'));releaseEscrow.mutate({transactionId:id},{onSuccess:()=>statusMessage('Escrow status updated.')});}}><input data-testid="input-escrow-id" name="transactionId" required placeholder="Transaction ID" className="min-w-0 flex-1 rounded-xl border border-[#dfe6df] px-3 py-2 text-sm"/><Button type="submit" variant="outline" disabled>Release disabled</Button></form><p className="mt-3 text-xs text-[#8c6c39]">Release control is disabled pending compliance approval.</p></section></div>
          {requestsQuery.data?.items.length ? <section className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Open property sourcing</h2>{requestsQuery.data.items.slice(0,4).map(r=><p key={r.id} className="mt-3 border-t border-[#edf1ec] pt-3 text-sm">{r.desiredTown}, {r.desiredState} · {r.status}</p>)}</section> : null}</div>;
      case '/sign-in':
      case '/sign-up': {
        const signup = location === '/sign-up';
        return <div className="grid min-h-[calc(100dvh-120px)] overflow-hidden rounded-[28px] border border-[#e4eae3] bg-white lg:grid-cols-[.9fr_1.1fr]"><section className="relative hidden flex-col justify-between overflow-hidden bg-[#0B0F0E] p-9 text-white lg:flex"><div className="absolute -right-24 -top-12 h-72 w-72 rounded-full border border-[#45674c]/60"/><div><LogoMark/><p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-[#9ec8a7]">Estatehold by Onyenic Civic Company Limited</p><h1 className="mt-5 font-display text-4xl font-extrabold leading-tight">Find a place.<br/><span className="text-[#82cf91]">Know where you stand.</span></h1></div><div className="flex items-center gap-3 text-sm text-[#c3cec4]"><ShieldCheck size={19} className="text-[#82cf91]"/>Location-verified listings and visible tenant safeguards.</div></section>
          <section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md"><div className="mb-7 lg:hidden"><LogoMark/></div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#65806a]">{signup ? 'Start your journey' : 'Welcome back'}</p><h2 className="mt-2 font-display text-3xl font-extrabold">{signup ? 'Create an account' : 'Sign in to Estatehold'}</h2><p className="mt-2 text-sm text-[#748077]">{signup ? 'A safer start to finding or managing a home.' : 'Your property journey is ready when you are.'}</p>
            {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}{authError && <div className="mt-4"><Notice tone="red">{authError}</Notice></div>}
            {config.isLoading ? <div className="mt-7"><LoadingCard/></div> : config.isError ? <div className="mt-7"><ErrorState onRetry={()=>config.refetch()}/></div> : <form onSubmit={e=>submitAuth(e,signup?'sign-up':'sign-in')} className="mt-7 space-y-4"><Field label="Email address" name="email" type="email" required placeholder="you@example.com"/><Field label="Password" name="password" type="password" required placeholder="At least 8 characters"/>{signup && <p className="text-xs leading-5 text-[#78847b]">We’ll send you a confirmation email if required by your account settings.</p>}
              <Button type="submit" disabled={!config.data || config.isLoading} testId="button-submit-auth">{signup ? 'Create account' : 'Sign in'} <ArrowRight size={15}/></Button></form>}
            <p className="mt-6 text-sm text-[#718077]">{signup ? 'Already have an account?' : 'New to Estatehold?'} <Link href={signup?'/sign-in':'/sign-up'} className="font-bold text-[#18783a]">{signup?'Sign in':'Create an account'}</Link></p>
            <p className="mt-8 text-xs leading-5 text-[#89958b]">By continuing, you agree to use Estatehold responsibly. Documents displayed here are drafts and require review by a Nigerian legal professional.</p></div></section></div>;
      }
      default: return <NotFound/>;
    }
  };
  if (shellRoutes.includes(location)) return <main className="estate-shell relative"><div className="grain"/><div className="relative z-10 mx-auto max-w-6xl p-4 sm:p-8"><div className="mb-4 flex items-center justify-between"><Link href="/" className="flex items-center gap-2"><LogoMark small/><span className="font-display text-lg font-extrabold">estatehold</span></Link><Link href="/" className="text-sm font-semibold text-[#607066]">Back to marketplace</Link></div>{content()}</div><footer className="relative z-10 pb-6 text-center text-xs text-[#88948a]">Estatehold by Onyenic Civic Company Limited</footer></main>;
  return <div className="estate-shell relative"><div className="grain"/><div className="relative z-10 flex min-h-[100dvh]">
    <aside className="no-print sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col overflow-y-auto bg-[#0B0F0E] px-4 py-5 text-[#eff4ee] lg:flex">
      <Link href="/" className="flex items-center gap-3 px-2"><LogoMark/><span><b className="block font-display text-[17px] font-extrabold">estatehold</b><span className="block text-[10px] text-[#90a394]">Find home. Hold with confidence.</span></span></Link>
      <div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#85978a]">Marketplace</div>
      <nav className="mt-2 space-y-1">{[['/','Home',Home],['/browse','Explore',Search],['/map','Map search',MapPin],['/social-housing','Shared ownership',HeartHandshake],['/requests','My requests',ListChecks]].map(([href,label,Icon])=>{const I=Icon as typeof Home;return <Link key={String(href)} href={String(href)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${location===href?'bg-[#1b2c20] text-[#8be19b]':'text-[#c3cec4] hover:bg-white/[.06]'}`}><I size={17}/>{String(label)}</Link>})}</nav>
      <div className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#85978a]">Your tools</div>
      <nav className="mt-2 space-y-1">{[['/request-property','Source a property',Compass],['/wallet','Wallet & fees',Wallet],['/installment-calculator','Installment planner',Calculator],['/profile','My profile',BadgeCheck],['/complaints/new','Report a concern',LifeBuoy],['/tenancy-agreement','Tenancy draft',FileText],['/poa/landlord','Landlord POA',FileText],['/poa/tenant','Tenant POA',FileCheck2],['/recovery','Recovery guide',Shield],['/admin','Operations desk',Activity]].map(([href,label,Icon])=>{const I=Icon as typeof Home;return <Link key={String(href)} href={String(href)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${location===href?'bg-[#1b2c20] text-[#8be19b]':'text-[#c3cec4] hover:bg-white/[.06]'}`}><I size={17}/>{String(label)}</Link>})}</nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#dce9dd]"><ShieldCheck size={15} className="text-[#7bd38c]"/>A little more certainty</div><p className="mt-2 text-xs leading-5 text-[#9aab9c]">Check the pin, read the terms, know your next step.</p><Link href="/recovery" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#8be19b]">Protection guide <ArrowRight size={13}/></Link></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="no-print sticky top-0 z-30 border-b border-[#e4eae3] bg-[#f7f8f4]/90 backdrop-blur-xl"><div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between px-4 sm:px-7">
        <div className="flex items-center gap-3 lg:hidden"><Link href="/" className="flex items-center gap-2"><LogoMark small/><span className="font-display font-extrabold">estatehold</span></Link></div>
        <div className="hidden items-center gap-2 text-xs font-medium text-[#718077] lg:flex"><MapPin size={14} className="text-[#16A34A]"/>Showing homes around <strong className="text-[#26372b]">{profileTown}</strong><ChevronDown size={14}/></div>
        <div className="ml-auto flex items-center gap-2"><Link href="/list-property" className="hidden items-center gap-2 rounded-xl bg-[#0B0F0E] px-4 py-2.5 text-xs font-bold text-white sm:inline-flex"><Plus size={15}/>List a property</Link>{authSession ? <button onClick={logout} className="flex h-10 items-center gap-2 rounded-full border border-[#dfe6df] bg-white px-3 text-xs font-bold" data-testid="button-sign-out"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f5e9] text-[#26723a]">{(authSession.user?.email||'E')[0].toUpperCase()}</span><span className="hidden sm:inline">Sign out</span></button> : <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6df] bg-white px-3 py-2.5 text-xs font-bold text-[#304039]"><LogIn size={14}/>Sign in</Link>}</div>
      </div></header>
      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-7 sm:px-7 sm:pt-9 lg:pb-12">
        <div className="mb-6 flex items-start justify-between gap-4"><div className="min-w-0">{location !== '/' && routeTitle && <p className="text-xs font-bold uppercase tracking-[.14em] text-[#67806b]">Estatehold <span className="px-1 text-[#a4b0a5]">/</span>{routeTitle}</p>}</div>{health.data && <span className="hidden items-center gap-1.5 rounded-full bg-[#e8f5e9] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#26723a] xl:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]"/>{health.data.status}</span>}</div>
        {notice && <div className="mb-5"><Notice>{notice}</Notice></div>}
        <div className="page-enter">{content()}</div>
        <footer className="mt-14 border-t border-[#e3e9e2] pt-5 text-xs text-[#89958b]">Estatehold by Onyenic Civic Company Limited <span className="mx-2">·</span> Documents are drafts pending Nigerian legal review</footer>
      </main>
    </div>
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe7df] bg-[#f9faf7]/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">{[['/','Home',Home],['/browse','Explore',Search],['/map','Map',MapPin],['/requests','Requests',ListChecks],['more','More',MoreHorizontal]].map(([href,label,Icon])=>{const I=Icon as typeof Home;return <button key={String(href)} onClick={()=>href==='more'?setMobileMore(s=>!s):navigate(String(href))} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-bold ${location===href?'text-[#16843d]':'text-[#76847a]'}`} data-testid={`nav-${String(label).toLowerCase()}`}><I size={19}/>{String(label)}</button>})}</div>
      {mobileMore && <div className="absolute bottom-[74px] right-3 max-h-[68dvh] w-[min(340px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-[#e2e9e2] bg-white p-2 shadow-xl">{routes.map(([href,label,Icon])=>{const I=Icon as typeof Home;return <Link key={href} href={href} onClick={()=>setMobileMore(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#304039] hover:bg-[#f1f7f1]"><I size={16} className="text-[#36834b]"/>{label}<ChevronRight className="ml-auto" size={14}/></Link>})}</div>}
    </nav>
  </div></div>;
}
function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#65806a]">{eyebrow}</p><h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.03em] sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718077]">{text}</p></div>;
}
function BrowsePage({ query, properties, profileTown, onRetry }: { query: ReturnType<typeof useListProperties>; properties: Property[]; profileTown: string; onRetry: () => void }) {
  const [search, setSearch] = useState('');
  const [intent, setIntent] = useState('all');
  const visible = properties.filter(p => (!search || `${p.title} ${p.town} ${p.state} ${p.category}`.toLowerCase().includes(search.toLowerCase())) && (intent==='all'||p.intent===intent));
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><PageIntro eyebrow="Find your next place" title="Homes worth a closer look" text={`Browse live property listings and start around ${profileTown}. Verified pins are clearly marked.`}/><Link href="/request-property" className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-[#28763d]">Can’t find it? Request a search <ArrowRight size={14}/></Link></div>
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e4eae3] bg-white p-3 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-2 rounded-xl bg-[#f4f7f3] px-3"><Search size={17} className="text-[#718077]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by town, title or type" className="h-11 w-full bg-transparent text-sm outline-none" data-testid="input-search-property"/></label><div className="flex items-center gap-2 overflow-x-auto">{[['all','All homes'],['rent','Rent'],['sale','Buy'],['social','Shared']].map(([val,label])=><button key={val} onClick={()=>setIntent(val)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${intent===val?'bg-[#e8f5e9] text-[#26723a]':'text-[#758078] hover:bg-[#f4f7f3]'}`}>{label}</button>)}</div><span className="hidden items-center gap-1 text-xs text-[#7b887e] md:inline-flex"><SlidersHorizontal size={14}/>Location first</span></div>
    {query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><LoadingCard/><LoadingCard/><LoadingCard/></div> : query.isError ? <ErrorState onRetry={onRetry}/> : visible.length ? <><p className="text-xs font-semibold text-[#77847a]">{visible.length} properties to explore</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(p=><PropertyCard key={p.id} property={p}/>)}</div></> : <EmptyState icon={Search} title={properties.length?'No matching places':'No listings to show yet'} body={properties.length?'Try a different search or adjust the intent filter.':'Current listings will appear here once available.'} action={properties.length?<button className="text-sm font-bold text-[#16783a]" onClick={()=>{setSearch('');setIntent('all')}}>Clear search filters</button>:undefined}/>}</div>;
}
function SocialHousingPage({ query }: { query: UseQueryResult<ListSocialHousingUnits200> }) {
  return <div className="space-y-6"><PageIntro eyebrow="A smaller step toward ownership" title="Shared housing units" text="Explore live fractional units and their current availability. Prices and status come directly from listed units."/><Notice>Unit availability and terms should be confirmed with the property team before payment. Payments remain in test mode.</Notice>
    {query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><LoadingCard/><LoadingCard/></div> : query.isError ? <ErrorState onRetry={()=>query.refetch()}/> : query.data?.items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{query.data.items.map(unit=><article key={unit.id} className="overflow-hidden rounded-2xl border border-[#e4eae3] bg-white">{unit.imageUrl?<img src={unit.imageUrl} alt={unit.propertyTitle} className="h-48 w-full object-cover"/>:<div className="flex h-48 items-center justify-center bg-[linear-gradient(135deg,#e8f5e9,#d8e5da)]"><Landmark size={48} className="text-[#77967b]" strokeWidth={1.2}/></div>}<div className="p-5"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-[11px] font-bold capitalize text-[#26723a]">{unit.status}</span><span className="text-xs text-[#7a877d]">{unit.town || 'Location not listed'}</span></div><h2 className="mt-4 font-display text-lg font-extrabold">{unit.propertyTitle}</h2><p className="mt-1 text-sm text-[#748077]">{unit.unitType}</p><div className="mt-4 flex items-center justify-between"><b className="font-display text-xl">{money(unit.unitPriceNaira)}</b><Link href={`/property/${unit.parentPropertyId}`} className="text-sm font-bold text-[#26723a]">View property <ArrowRight className="ml-1 inline" size={14}/></Link></div></div></article>)}</div> : <EmptyState icon={HeartHandshake} title="No units available right now" body="When shared housing units are listed, you’ll find their unit type, price and availability here."/>}</div>;
}
function WalletPage({ quote, onQuote, calc, payment, paymentResult, setPayment }: { quote: FeeQuote|null; onQuote: (q:FeeQuote|null)=>void; calc: ReturnType<typeof useCalculateFees>; payment: ReturnType<typeof useInitializePayment>; paymentResult: {reference:string;authorizationUrl:string;mode:string}|null; setPayment:(v:{reference:string;authorizationUrl:string;mode:string}|null)=>void }) {
  return <div className="mx-auto max-w-5xl space-y-6"><PageIntro eyebrow="Know the numbers first" title="Fees & test checkout" text="Request the fee split from the Estatehold calculator. Checkout here runs in test mode only."/><Notice tone="amber"><b>Test mode only.</b> No real payment will be taken. Escrow release is disabled pending compliance approval.</Notice>
    <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const arrangement=String(fd.get('arrangement'));calc.mutate({data:{transactionType:String(fd.get('transactionType')) as 'sale'|'rent_year_one'|'rent_renewal'|'rent_micro_installment'|'social_housing',amountNaira:Number(fd.get('amountNaira')),isManaged:arrangement==='managed',isDirectLandlord:arrangement==='direct'}},{onSuccess:onQuote});}} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7"><h2 className="font-display text-xl font-extrabold">Estimate a transaction</h2><Field label="Transaction amount (₦)" name="amountNaira" type="number" min={1} required placeholder="e.g. 1800000"/><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Transaction type" name="transactionType" options={[['rent_year_one','First year’s rent'],['rent_renewal','Rent renewal'],['rent_micro_installment','Rent installment'],['sale','Property sale'],['social_housing','Shared housing']]}/><SelectField label="Listing arrangement" name="arrangement" options={[['direct','Direct landlord'],['managed','Managed property']]}/></div>
      {calc.isError && <Notice tone="red">Fee quote could not be calculated. Please try again.</Notice>}<Button type="submit" disabled={calc.isPending}>{calc.isPending?'Calculating…':'Calculate fees'} <ArrowRight size={15}/></Button>
      {quote && <div className="rounded-2xl bg-[#f2f8f2] p-4"><h3 className="font-bold">Quote breakdown</h3><dl className="mt-3 space-y-2 text-sm">{[['Buyer pays',quote.buyerPaysNaira],['Landlord pays',quote.landlordPaysNaira],['Platform fee',quote.platformFeeNaira],['Agent fee',quote.agentFeeNaira],['Landlord receives',quote.landlordReceivesNaira]].map(([k,v])=><div key={String(k)} className="flex justify-between gap-4"><dt className="text-[#65746a]">{String(k)}</dt><dd className="font-bold">{money(Number(v))}</dd></div>)}</dl>{quote.note && <p className="mt-3 text-xs text-[#718077]">{quote.note}</p>}</div>}
    </form>
    <section className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#26723a]"><Wallet size={20}/></div><h2 className="font-display text-xl font-extrabold">Test checkout</h2><p className="text-sm leading-6 text-[#718077]">Initialize a simulated payment from an existing Estatehold transaction.</p><Field label="Transaction ID" name="transactionId" required placeholder="Enter an existing transaction ID"/>
      <Button onClick={()=>{const id=(document.querySelector('[data-testid=\"input-transactionId\"]') as HTMLInputElement)?.value.trim();if(!id)return;payment.mutate({data:{transactionId:id}},{onSuccess:r=>setPayment(r)});}} disabled={payment.isPending}>{payment.isPending?'Starting test checkout…':'Initialize test payment'} <ArrowRight size={15}/></Button>
      {payment.isError && <Notice tone="red">Payment initialization did not complete. Try again.</Notice>}{paymentResult && <div className="rounded-xl border border-[#cce5d0] bg-[#f1faf2] p-4 text-sm"><div className="flex items-center gap-2 font-bold text-[#28663b]"><Check size={16}/>Test payment ready</div><p className="mt-2 text-xs text-[#63746a]">Reference: {paymentResult.reference} · Mode: {paymentResult.mode}</p><a href={paymentResult.authorizationUrl} className="mt-3 inline-block font-bold text-[#16783a] underline">Continue to test authorization</a></div>}
    </section></div></div>;
}
function InstallmentPage({ quote, onQuote, calc }: { quote:InstallmentQuote|null; onQuote:(q:InstallmentQuote|null)=>void; calc:ReturnType<typeof useCalculateInstallments> }) {
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="Plan what works" title="Installment calculator" text="Check the installment schedule returned by Estatehold before you take the next step."/><div className="grid gap-5 md:grid-cols-[.8fr_1.2fr]"><form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);calc.mutate({data:{amountNaira:Number(fd.get('installmentAmount')),count:Number(fd.get('count'))}},{onSuccess:onQuote});}} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-6"><Field label="Total amount (₦)" name="installmentAmount" type="number" min={1} required placeholder="Enter amount"/><SelectField label="Number of installments" name="count" defaultValue="3" options={ [['2','2 installments'],['3','3 installments'],['4','4 installments']]}/>{calc.isError&&<Notice tone="red">The schedule could not be calculated.</Notice>}<Button type="submit" disabled={calc.isPending}>{calc.isPending?'Calculating…':'Build schedule'}</Button></form>
    {quote?<div className="rounded-3xl border border-[#e4eae3] bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-[#65806a]">Payment schedule</p><h2 className="mt-1 font-display text-2xl font-extrabold">Your installments</h2></div><Calculator className="text-[#3a874d]"/></div><div className="mt-5 space-y-3">{quote.items.map(item=><div key={item.number} className="flex items-center justify-between rounded-xl bg-[#f4f8f3] p-4"><span className="flex items-center gap-3 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#23743a]">{item.number}</span>Payment {item.number}</span><b>{money(item.amountNaira)}</b></div>)}</div><div className="mt-4 flex justify-between border-t border-[#e6ece5] pt-4"><span className="font-bold">Total</span><b className="font-display text-xl">{money(quote.totalNaira)}</b></div></div>:<EmptyState icon={Calculator} title="A schedule, not a guess" body="Enter the full amount and choose 2–4 installments to see the calculated schedule."/>}</div></div>;
}
function ProfilePage({ profile, updateProfile, onSubmit, authSession, onLogout }: { profile:UseQueryResult<Profile>; updateProfile:ReturnType<typeof useUpdateProfile>; onSubmit:(d:FormData)=>void; authSession:{access_token:string;user?:{email?:string}}|null;onLogout:()=>void }) {
  const p=profile.data;
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="Your Estatehold identity" title="Profile & verification" text="Your location helps personalize discovery. Verification status is shown as returned by Estatehold."/>
    {profile.isLoading?<LoadingCard/>:profile.isError?<ErrorState onRetry={()=>profile.refetch()}/>:<div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]"><section className="h-fit rounded-3xl bg-[#0B0F0E] p-6 text-white"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#183b22] text-xl font-extrabold text-[#89d697]">{p?.fullName?.split(/\s/).map(s=>s[0]).slice(0,2).join('')||'EH'}</div><h2 className="mt-4 font-display text-2xl font-extrabold">{p?.fullName||'Estatehold profile'}</h2><p className="mt-1 text-sm text-[#a9b8aa]">{p?.email||authSession?.user?.email||'Email not available'}</p><div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[.07] p-3 text-sm"><ShieldCheck size={17} className="text-[#8ad697]"/><span className="capitalize">{(p?.verificationStatus||'unverified').replace('_',' ')} verification</span></div><div className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-[#9eaea0]">KYC and legal details are handled in line with Estatehold’s review process.</div>{authSession && <button onClick={onLogout} className="mt-4 text-xs font-bold text-[#9bd6a4]">Sign out</button>}</section>
      <form onSubmit={e=>{e.preventDefault();onSubmit(new FormData(e.currentTarget));}} className="grid gap-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:grid-cols-2 sm:p-7"><Field label="Full name" name="fullName" required defaultValue={p?.fullName}/><Field label="Email address (managed by auth)" name="email" type="email" defaultValue={p?.email || authSession?.user?.email} readOnly/><Field label="Phone" name="phone" defaultValue={p?.phone}/><SelectField label="Account role" name="role" defaultValue={p?.role||'client'} options={[['client','Client'],['landlord','Landlord'],['agent','Agent'],['attorney','Attorney']]}/><Field label="Country" name="country" defaultValue="Nigeria"/><Field label="State" name="state" required defaultValue={p?.state}/><Field label="LGA" name="lga" defaultValue={p?.lga}/><Field label="Town" name="town" required defaultValue={p?.town}/><Field label="Village of origin" name="villageOfOrigin" defaultValue={p?.villageOfOrigin}/><Field label="NBA seal number (attorney)" name="nbaSealNumber" defaultValue={p?.nbaSealNumber}/><Field label="Bank name" name="bankName" defaultValue={p?.bankName}/><Field label="Account last four digits" name="bankAccountLast4" defaultValue={p?.bankAccountLast4}/>{updateProfile.isError&&<div className="sm:col-span-2"><Notice tone="red">Profile update failed. Review required fields and retry.</Notice></div>}<div className="sm:col-span-2"><Button type="submit" disabled={updateProfile.isPending}>{updateProfile.isPending?'Saving profile…':'Save profile'} <Check size={15}/></Button></div></form></div>}</div>;
}
function PoaPage({ tenant }: { tenant:boolean }) {
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="Document workspace" title={`${tenant?'Tenant':'Landlord'} power of attorney`} text="A structured draft to prepare for discussion with a qualified Nigerian legal professional."/><Notice tone="amber"><b>Draft only — not legal advice.</b> This document has no legal effect until reviewed and executed in accordance with Nigerian law by qualified counsel.</Notice>
    <article className="rounded-3xl border border-[#e4eae3] bg-white p-6 sm:p-10"><div className="flex items-center justify-between border-b border-[#e7ece6] pb-5"><div><p className="font-mono-ui text-[10px] font-bold uppercase tracking-[.16em] text-[#66816b]">Estatehold · working draft</p><h2 className="mt-2 font-display text-2xl font-extrabold">Power of Attorney</h2></div><span className="rounded-full bg-[#fff5dc] px-3 py-1 text-xs font-bold text-[#80611e]">DRAFT</span></div>
      <div className="prose prose-sm mt-6 max-w-none text-[#4c5b50]"><p>This draft is prepared for discussion in relation to property interests in the Federal Republic of Nigeria. It is not a substitute for independent legal advice, title checks, statutory approvals or proper execution.</p><h3>Parties</h3><p><b>{tenant?'Tenant / Principal':'Landlord / Principal'}:</b> ____________________________________</p><p><b>Appointed attorney:</b> ____________________________________</p><p><b>Property address and title reference:</b> ____________________________________</p><h3>Proposed authority</h3><p>The Principal may grant limited authority for the attorney to act only within the scope, duration and safeguards agreed by both parties in the final counsel-reviewed instrument. No authority is granted by this draft itself.</p><h3>Safeguards to be confirmed with counsel</h3><ul><li>Confirm the identity and capacity of each party.</li><li>Confirm property title, scope, duration and revocation procedure.</li><li>Confirm any witnessing, stamping, registration or state-specific requirements.</li></ul><p><b>Draft prepared on:</b> {new Date().toLocaleDateString('en-NG')}</p><p><b>Signature:</b> ____________________________ <b>Date:</b> __________________</p></div>
      <div className="no-print mt-8 flex flex-wrap gap-3"><Button onClick={()=>window.print()}><FileText size={15}/>Print draft</Button><Link href="/profile" className="inline-flex min-h-11 items-center rounded-xl border border-[#dfe6df] px-4 text-sm font-bold">Complete your profile</Link></div>
    </article></div>;
}
function RecoveryPage() {
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="A safer way forward" title="Property recovery guide" text="A practical checklist to help you organize your next steps. The right process depends on your tenancy and location."/>
    <Notice tone="amber">This guide is general information, not legal advice. Do not use force, remove belongings, change locks or interrupt essential services without a lawful process.</Notice>
    <div className="grid gap-4 md:grid-cols-[.7fr_1.3fr]"><aside className="rounded-3xl bg-[#0B0F0E] p-6 text-white"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1b3822] text-[#8bd897]"><Shield size={20}/></div><h2 className="mt-5 font-display text-2xl font-extrabold">Start with safety.</h2><p className="mt-2 text-sm leading-6 text-[#bcc8bd]">If anyone is in immediate danger, contact local emergency services. Keep copies of your messages and agreements.</p><Link href="/complaints/new" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#8bd897]">Report a concern <ArrowRight size={15}/></Link></aside>
      <section className="space-y-3">{[['01','Gather your records','Collect your tenancy agreement, rent receipts, notices, correspondence and dated photographs. Keep original files unchanged.'],['02','Check the notice and timeline','Review the agreement and any notice served. Requirements may vary by state and tenancy type.'],['03','Write down the facts','Create a dated timeline of events, who was present and what was communicated. Stick to what you can support.'],['04','Seek qualified local advice','Speak to a Nigerian lawyer or an appropriate tenant support organization before taking formal action.'],['05','Use calm, documented communication','Keep communications respectful, written and focused on a practical resolution. Avoid threats or self-help measures.']].map(([n,title,body])=><article key={n} className="flex gap-4 rounded-2xl border border-[#e4eae3] bg-white p-5"><span className="font-mono-ui text-sm font-bold text-[#39844b]">{n}</span><div><h3 className="font-display font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#718077]">{body}</p></div></article>)}</section></div>
    <div className="grid gap-3 sm:grid-cols-2"><Link href="/complaints/new" className="rounded-2xl bg-[#e8f5e9] p-5"><MessageSquareWarning className="text-[#26723a]"/><b className="mt-3 block">Lodge a complaint</b><span className="mt-1 block text-sm text-[#657b69]">Share a service issue or misconduct concern.</span></Link><Link href="/tenancy-agreement" className="rounded-2xl border border-[#e4eae3] bg-white p-5"><FileText className="text-[#26723a]"/><b className="mt-3 block">Review a tenancy draft</b><span className="mt-1 block text-sm text-[#657b69]">Start a draft, then have it reviewed by counsel.</span></Link></div></div>;
}
function AgreementPage({ properties, mutation, result, onResult }: { properties:Property[]; mutation:ReturnType<typeof useCreateTenancyAgreement>; result:{id:string;reviewNotice:string}|null;onResult:(r:{id:string;reviewNotice:string}|null)=>void }) {
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="A document draft" title="Tenancy agreement" text="Prepare an agreement draft through the Estatehold workflow, then print it for independent review."/><Notice tone="amber"><b>Draft — requires Nigerian legal review.</b> This is not a signed tenancy agreement and should not be treated as legal advice.</Notice>
    <form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);mutation.mutate({data:{propertyId:String(fd.get('propertyId')),tenantName:String(fd.get('tenantName')),landlordName:String(fd.get('landlordName')),rentNaira:Number(fd.get('rentNaira')),paymentMode:String(fd.get('paymentMode')) as 'full'|'installments'|'daily'|'weekly'|'monthly',premisesRulesUrl:String(fd.get('premisesRulesUrl')||'')||undefined,mediationAccepted:fd.get('mediationAccepted')==='on'}},{onSuccess:r=>onResult(r)});}} className="grid gap-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:grid-cols-2 sm:p-8">
      <SelectField label="Property" name="propertyId" options={properties.map(p=>[p.id,`${p.title} · ${p.town}`])}/><SelectField label="Payment plan" name="paymentMode" options={[['full','Full payment'],['installments','Installments'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']]}/><Field label="Tenant name" name="tenantName" required placeholder="Tenant full name"/><Field label="Landlord name" name="landlordName" required placeholder="Landlord full name"/><Field label="Rent amount (₦)" name="rentNaira" type="number" min={1} required placeholder="Amount"/><Field label="Premises rules URL (optional)" name="premisesRulesUrl" placeholder="https://…"/>
      <label className="flex items-start gap-3 text-sm leading-5 text-[#58675d] sm:col-span-2"><input name="mediationAccepted" type="checkbox" required className="mt-1 accent-[#16A34A]"/>The parties accept mediation as a proposed dispute-resolution option, subject to review of final terms.</label>
      {mutation.isError&&<div className="sm:col-span-2"><Notice tone="red">The draft could not be created. Check your details and try again.</Notice></div>}<div className="sm:col-span-2"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending?'Preparing draft…':'Create agreement draft'} <FileText size={15}/></Button></div>
    </form>
    {result&&<article className="rounded-3xl border border-[#cbe4cf] bg-white p-6"><div className="flex items-center gap-2 font-bold text-[#26723a]"><Check size={18}/>Draft created</div><p className="mt-2 text-sm text-[#65746a]">Reference: {result.id}</p><p className="mt-3 rounded-xl bg-[#fff9e9] p-4 text-sm text-[#755d21]">{result.reviewNotice}</p><div className="no-print mt-4"><Button variant="outline" onClick={()=>window.print()}>Print draft details</Button></div></article>}</div>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/"><AppContent/></Route><Route path="/browse"><AppContent/></Route><Route path="/map"><AppContent/></Route><Route path="/property/:id"><AppContent/></Route>
    <Route path="/list-property"><AppContent/></Route><Route path="/request-property"><AppContent/></Route><Route path="/requests"><AppContent/></Route><Route path="/social-housing"><AppContent/></Route><Route path="/complaints/new"><AppContent/></Route>
    <Route path="/wallet"><AppContent/></Route><Route path="/installment-calculator"><AppContent/></Route><Route path="/profile"><AppContent/></Route><Route path="/poa/landlord"><AppContent/></Route><Route path="/poa/tenant"><AppContent/></Route>
    <Route path="/recovery"><AppContent/></Route><Route path="/tenancy-agreement"><AppContent/></Route><Route path="/admin"><AppContent/></Route><Route path="/sign-in"><AppContent/></Route><Route path="/sign-up"><AppContent/></Route><Route component={NotFound}/>
  </Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, useLocation, useRoute, Router as WouterRouter } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import {
  getGetAdminDashboardQueryKey, getGetDashboardQueryKey, getGetProfileQueryKey, getGetPublicConfigQueryKey,
  getGetPropertyQueryKey, getGetProcessingFeeScheduleQueryKey, getHealthCheckQueryKey, getListComplaintsQueryKey, getListPropertiesQueryKey,
  getListAdminKycQueueQueryKey, getListAdminHotelVerificationQueueQueryKey, getListSocialHousingUnitsQueryKey,
  getListAdminLandlordKycQueueQueryKey,
  useGetProcessingFeeSchedule,
  getListSpecialRequestsQueryKey, useListAdminKycQueue, useListAdminHotelVerificationQueue, useReviewKyc,
  useReviewHotelVerification, useCalculateFees, useCalculateInstallments,
  useListAdminLandlordKycQueue, useReviewLandlordKyc,
  useCreateComplaint, useCreateProperty, useCreateSpecialRequest, useCreateTenancyAgreement, useGetAdminDashboard,
  getGetPayoutBanksQueryKey, getGetPayoutDestinationQueryKey, useGetPayoutBanks, useGetPayoutDestination,
  useSavePayoutDestination, useGetDashboard, useGetProfile, useGetProperty, useGetPublicConfig, useHealthCheck, useInitializePayment,
  useListComplaints, useListProperties, useListSocialHousingUnits, useListSpecialRequests, useReleaseEscrow,
  useRequestPropertyDelisting, useUpdateProfile,
} from '@workspace/api-client-react';
import type { ComplaintInput, FeeQuote, InstallmentQuote, ListProperties200, ListSocialHousingUnits200, ListSpecialRequests200, PayoutBank, PayoutDestination, ProcessingFeeSchedule, Property, Profile, ProfileInput, SpecialRequestInput } from '@workspace/api-client-react';
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, Building2, Calculator, Check, ChevronDown, ChevronRight,
  CircleAlert, Compass, FileCheck2, FileText, HeartHandshake, Home, Landmark, LifeBuoy,
  ListChecks, LoaderCircle, LockKeyhole, LogIn, MapPin, MessageSquareWarning, MoreHorizontal,
  Plus, Search, Shield, ShieldCheck, SlidersHorizontal, Wallet,
} from 'lucide-react';
import NotFound from '@/pages/not-found';
import LandlordKycPage from '@/pages/LandlordKycPage';
import EstateholdMap from '@/components/EstateholdMap';
import PropertyPhotoCapture, { distanceMeters, type LivePropertyProof } from '@/components/PropertyPhotoCapture';

const queryClient = new QueryClient();
const routes = [
  ['/hotels', 'Hotels & short-lets', Building2], ['/register-agent', 'Register as an agent', BadgeCheck],
  ['/agent-dashboard', 'Agent dashboard', Activity],
  ['/browse', 'Explore homes', Search], ['/map', 'Map search', MapPin], ['/list-property', 'List a property', Plus],
  ['/request-property', 'Find a property', Compass], ['/requests', 'My requests', ListChecks],
  ['/processing-fees', 'Processing fees', Wallet], ['/offices', 'Offices near you', MapPin],
  ['/social-housing', 'Shared ownership', HeartHandshake], ['/complaints/new', 'Report an issue', LifeBuoy],
  ['/wallet', 'Wallet & checkout', Wallet], ['/installment-calculator', 'Installment planner', Calculator],
  ['/profile', 'My profile', BadgeCheck], ['/poa/landlord', 'Landlord POA draft', FileText],
  ['/poa/tenant', 'Tenant POA draft', FileCheck2], ['/recovery', 'Property recovery', Shield],
  ['/tenancy-agreement', 'Tenancy agreement', FileText], ['/admin', 'Operations desk', Activity],
  ['/landlord-kyc', 'Landlord KYC & indemnity', ShieldCheck],
] as const;
type AdminWorkspaceData = {
  agents: Array<{ id: string; fullName?: string; email?: string; phone?: string; town?: string; agencyName?: string; verificationStatus?: string }>;
  users: Array<{ id: string; fullName?: string; email?: string; role?: string; verificationStatus?: string }>;
  properties: Array<{ id: string; title?: string; category?: string; state?: string; town?: string; moderationStatus?: string; isActive?: boolean }>;
  payments: Array<{ id: string; status?: string; amountNaira?: number; agentFeeNaira?: number; platformFeeNaira?: number; createdAt?: string }>;
  agentPayouts: Array<{ id: string; transactionId: string; agentId: string; amountNaira: number; status: string; transferReference: string; transferCode?: string | null; recipientBankName?: string | null; recipientAccountLast4?: string | null; providerStatus?: string | null; failureMessage?: string | null; createdAt?: string }>;
};
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
function Field({ label, name, type = 'text', placeholder, required = false, defaultValue, min, step, readOnly = false, inputMode, autoComplete, maxLength, pattern }: {
  label: string; name: string; type?: string; placeholder?: string; required?: boolean; defaultValue?: string | number; min?: number; step?: number; readOnly?: boolean;
  inputMode?: 'numeric'; autoComplete?: string; maxLength?: number; pattern?: string;
}) {
  return <label className="block text-sm font-semibold text-[#304039]">{label}<input data-testid={`input-${name}`} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} min={min} step={step} readOnly={readOnly} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLength} pattern={pattern}
    className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal text-[#17211b] outline-none transition focus:border-[#16A34A] focus:ring-4 focus:ring-[#16A34A]/10" /></label>;
}
function SelectField({ label, name, options, defaultValue, disabledOptions = [] }: { label: string; name: string; options: Array<[string, string]>; defaultValue?: string; disabledOptions?: string[] }) {
  return <label className="block text-sm font-semibold text-[#304039]">{label}<select data-testid={`input-${name}`} name={name} defaultValue={defaultValue} className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal text-[#17211b] outline-none focus:border-[#16A34A]">
    {options.map(([value, text]) => <option key={value} value={value} disabled={disabledOptions.includes(value)}>{text}</option>)}</select></label>;
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
function ErrorState({ onRetry, error }: { onRetry: () => void; error?: unknown }) {
  const detail = error instanceof Error && error.message && error.message !== 'Error'
    ? error.message.slice(0, 280)
    : 'Check your connection and try again.';
  return <div className="rounded-2xl border border-[#f0d2cf] bg-[#fff8f6] p-6 text-[#853b32]"><div className="flex items-center gap-2 font-bold"><CircleAlert size={18}/> We couldn’t load this right now.</div><p className="mt-1 text-sm text-[#855c56]">{detail}</p><button onClick={onRetry} className="mt-4 text-sm font-bold underline">Try again</button></div>;
}
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
      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-[#31513a]">{property.intent === 'rent' ? 'For rent' : property.intent === 'lease' ? 'For lease' : property.intent === 'social' ? 'Shared home' : 'For sale'}</span>
      {property.id.startsWith('offline-demo-') && <span className="absolute bottom-3 left-3 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-900">Demo sample · not live</span>}
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
  const [propertyProof, setPropertyProof] = useState<LivePropertyProof | null>(null);
  const [propertyProofError, setPropertyProofError] = useState('');
  const [listingCoordinates, setListingCoordinates] = useState({ latitude: 0, longitude: 0 });
  const [authSession, setAuthSession] = useState<{ access_token: string; user?: { email?: string; id?: string } } | null>(() => {
    try { const raw = localStorage.getItem('estatehold-session'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [adminWorkspace, setAdminWorkspace] = useState<AdminWorkspaceData | null>(null);
  const [adminWorkspaceError, setAdminWorkspaceError] = useState('');
  const [adminWorkspaceLoading, setAdminWorkspaceLoading] = useState(false);
  const [adminWorkspaceTab, setAdminWorkspaceTab] = useState('Pending Agents');
  const [adminWorkspaceReload, setAdminWorkspaceReload] = useState(0);
  const queryClient = useQueryClient();
  const config = useGetPublicConfig({ query: { queryKey: getGetPublicConfigQueryKey() } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const dashboard = useGetDashboard({ query: { enabled: location === '/', queryKey: getGetDashboardQueryKey(), retry: false } });
  const profile = useGetProfile({ query: { enabled: !!authSession || ['/profile','/admin','/agent-dashboard'].includes(location), queryKey: getGetProfileQueryKey(), retry: false } });
  const payoutBanks = useGetPayoutBanks({ query: { enabled: location === '/profile' && !!authSession, queryKey: getGetPayoutBanksQueryKey(), staleTime: 5 * 60 * 1000, retry: false } });
  const payoutDestination = useGetPayoutDestination({ query: { enabled: location === '/profile' && !!authSession, queryKey: [...getGetPayoutDestinationQueryKey(), authSession?.user?.id], retry: false } });
  useEffect(() => {
    if (location !== '/admin' || !authSession) return;
    let active = true;
    setAdminWorkspaceLoading(true);
    fetch('/api/admin/workspace-data', { headers: { Authorization: `Bearer ${authSession.access_token}` } })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || 'Admin data could not be loaded.');
        return payload as AdminWorkspaceData;
      })
      .then(data => { if (active) { setAdminWorkspace(data); setAdminWorkspaceError(''); } })
      .catch(error => { if (active) setAdminWorkspaceError(error instanceof Error ? error.message : 'Admin data could not be loaded.'); })
      .finally(() => { if (active) setAdminWorkspaceLoading(false); });
    return () => { active = false; };
  }, [location, authSession?.access_token, adminWorkspaceReload]);
  const propertyFilters = useMemo(() => ({ town: profile.data?.town || undefined }), [profile.data?.town]);
  const propertiesQuery = useListProperties(propertyFilters, { query: { enabled: ['/','/browse','/map','/tenancy-agreement'].includes(location), queryKey: getListPropertiesQueryKey(propertyFilters), retry: false } });
  const hotelsQuery = useListProperties({}, { query: { enabled: location === '/hotels', queryKey: getListPropertiesQueryKey({}), retry: false } });
  const processingFeesQuery = useGetProcessingFeeSchedule({ query: { enabled: location === '/processing-fees', retry: false, queryKey: getGetProcessingFeeScheduleQueryKey() } });
  const socialQuery = useListSocialHousingUnits({ query: { enabled: location === '/social-housing', queryKey: getListSocialHousingUnitsQueryKey() } });
  const requestsQuery = useListSpecialRequests({ query: { enabled: ['/requests','/admin'].includes(location), queryKey: getListSpecialRequestsQueryKey() } });
  const complaintsQuery = useListComplaints({ query: { enabled: ['/admin'].includes(location), queryKey: getListComplaintsQueryKey() } });
  const adminQuery = useGetAdminDashboard({ query: { enabled: location === '/admin', queryKey: getGetAdminDashboardQueryKey() } });
  const kycQueue = useListAdminKycQueue({ query: { enabled: location === '/admin', queryKey: getListAdminKycQueueQueryKey() } });
  const landlordKycQueue = useListAdminLandlordKycQueue({ query: { enabled: location === '/admin' && adminWorkspaceTab === 'Landlord KYC', queryKey: getListAdminLandlordKycQueueQueryKey(), retry: false } });
  const reviewLandlordKyc = useReviewLandlordKyc();
  const hotelQueue = useListAdminHotelVerificationQueue({ query: { enabled: location === '/admin', queryKey: getListAdminHotelVerificationQueueQueryKey() } });
  const singleProperty = useGetProperty(propertyRouteParams?.id || '', { query: { enabled: !!propertyRoute && !!propertyRouteParams?.id, queryKey: getGetPropertyQueryKey(propertyRouteParams?.id || '') } });
  const createProperty = useCreateProperty();
  const createRequest = useCreateSpecialRequest();
  const createComplaint = useCreateComplaint();
  const updateProfile = useUpdateProfile();
  const savePayoutDestination = useSavePayoutDestination({ mutation: { gcTime: 0 } });
  const calculateFees = useCalculateFees();
  const calculateInstallments = useCalculateInstallments();
  const initializePayment = useInitializePayment();
  const createAgreement = useCreateTenancyAgreement();
  const delisting = useRequestPropertyDelisting();
  const releaseEscrow = useReleaseEscrow();
  const reviewKyc = useReviewKyc();
  const reviewHotel = useReviewHotelVerification();
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);
  const [installmentQuote, setInstallmentQuote] = useState<InstallmentQuote | null>(null);
  const [paymentResult, setPaymentResult] = useState<{ reference: string; authorizationUrl: string; mode: string } | null>(null);
  const [createdAgreement, setCreatedAgreement] = useState<{ id: string; reviewNotice: string } | null>(null);
  const [authError, setAuthError] = useState('');
  const [agentFormError, setAgentFormError] = useState('');
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [checkInConsents, setCheckInConsents] = useState<Record<string, boolean>>({});
  const [googleMapsState, setGoogleMapsState] = useState<'missing'|'loading'|'ready'|'failed'>('missing');
  // Use only an explicit Vite key for the optional Google provider. Ignore any
  // legacy server-provided key so OpenStreetMap remains the default.
  const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => { setAuthTokenGetter(() => authSession?.access_token || null); return () => setAuthTokenGetter(null); }, [authSession]);
  useEffect(() => {
    if (!googleMapsKey) { setGoogleMapsState('missing'); return; }
    setGoogleMapsState('loading');
    const googleWindow = window as typeof window & { google?: { maps?: unknown }; gm_authFailure?: () => void };
    const previousAuthFailure = googleWindow.gm_authFailure;
    let authenticationFailed = false;
    googleWindow.gm_authFailure = () => {
      authenticationFailed = true;
      setGoogleMapsState('failed');
      previousAuthFailure?.();
    };
    let script = document.getElementById('estatehold-maps') as HTMLScriptElement | null;
    const handleLoad = () => window.setTimeout(() => {
      setGoogleMapsState(!authenticationFailed && googleWindow.google?.maps ? 'ready' : 'failed');
    }, 500);
    const handleError = () => setGoogleMapsState('failed');
    if (googleWindow.google?.maps) {
      setGoogleMapsState('ready');
    } else {
      if (!script) {
        script = document.createElement('script');
        script.id = 'estatehold-maps';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}`;
        script.async = true;
      }
      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      if (!script.isConnected) document.head.appendChild(script);
    }
    const timeout = window.setTimeout(() => setGoogleMapsState(current => current === 'ready' ? current : 'failed'), 15000);
    return () => {
      window.clearTimeout(timeout);
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
      googleWindow.gm_authFailure = previousAuthFailure;
    };
  }, [googleMapsKey]);
  useEffect(() => { setNotice(''); }, [location]);
  useEffect(() => {
    if (dashboard.data?.dataSource === 'mock' || propertiesQuery.data?.dataSource === 'mock') {
      setNotice('Live data offline — showing clearly labeled demo properties.');
    }
  }, [dashboard.data?.dataSource, propertiesQuery.data?.dataSource]);
  const items = dashboard.data?.items || propertiesQuery.data?.items || [];
  const filteredProperties = useMemo(() => propertiesQuery.data?.items || [], [propertiesQuery.data]);
  const profileTown = profile.data?.town || dashboard.data?.location || 'your area';
  const submitWith = (handler: (data: FormData) => void) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); handler(new FormData(event.currentTarget));
  };
  const syncListingCoordinates = (event: FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    setListingCoordinates({ latitude: Number(form.get('latitude')) || 0, longitude: Number(form.get('longitude')) || 0 });
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
  const logout = () => { localStorage.removeItem('estatehold-session'); setAuthSession(null); queryClient.removeQueries({ queryKey: getGetPayoutDestinationQueryKey() }); statusMessage('You have signed out.'); };
  const shellRoutes = ['/sign-in','/sign-up'];
  const routeTitle = routes.find(([path]) => path === location)?.[1] || '';
  const submitProperty = (fd: FormData) => {
    setPropertyProofError('');
    const input = {
      title: String(fd.get('title')), category: String(fd.get('category')) as Property['category'], customType: String(fd.get('customType') || '') || undefined,
      state: String(fd.get('state')), town: String(fd.get('town')), address: String(fd.get('address') || '') || undefined, description: String(fd.get('description') || '') || undefined,
      priceNaira: Number(fd.get('priceNaira')), priceUnit: String(fd.get('priceUnit') || '') || undefined, intent: String(fd.get('intent')) as Property['intent'],
      bedrooms: Number(fd.get('bedrooms')) || undefined, bathrooms: Number(fd.get('bathrooms')) || undefined, sizeSqm: Number(fd.get('sizeSqm')) || undefined,
      latitude: Number(fd.get('latitude')) || 0, longitude: Number(fd.get('longitude')) || 0, imageUrl: String(fd.get('imageUrl') || '') || undefined, premisesRulesUrl: String(fd.get('premisesRulesUrl') || '') || undefined,
      hotelCacNumber: String(fd.get('hotelCacNumber') || '') || undefined,
      emergencyContactPhone: String(fd.get('emergencyContactPhone') || '') || undefined,
      hotelHas24HourReception: Boolean(fd.get('hotelHas24HourReception')),
      hotelCctvCommonAreas: Boolean(fd.get('hotelCctvCommonAreas')),
      hotelCctvDisclosed: Boolean(fd.get('hotelCctvDisclosed')),
      hotelSafetyCheckinAvailable: Boolean(fd.get('hotelSafetyCheckinAvailable')),
    };
    if (propertyProof && distanceMeters(propertyProof.latitude, propertyProof.longitude, input.latitude, input.longitude) > 100) {
      setPropertyProofError('The live photo must be taken within 100m of the listing coordinates.');
      return;
    }
    createProperty.mutate({ data: input }, { onSuccess: async result => {
      let proofSaved = false;
      let proofFailure = '';
      if (propertyProof) {
        try {
          if (!authSession || !profile.data?.id || !config.data?.supabaseUrl || !config.data.supabaseAnonKey) throw new Error('Secure photo storage is unavailable.');
          const path = `${profile.data.id}/property-verification/${result.id}/${crypto.randomUUID()}.jpg`;
          const storageUrl = `${config.data.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/estatehold-evidence/${path.split('/').map(encodeURIComponent).join('/')}`;
          const upload = await fetch(storageUrl, { method: 'POST', headers: { apikey: config.data.supabaseAnonKey, Authorization: `Bearer ${authSession.access_token}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: propertyProof.file });
          if (!upload.ok) throw new Error('Private photo storage rejected the upload.');
          const saved = await fetch(`/api/properties/${encodeURIComponent(result.id)}/photos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` }, body: JSON.stringify({ photoUrl: path, latitude: propertyProof.latitude, longitude: propertyProof.longitude, takenAt: propertyProof.takenAt, device: propertyProof.device }) });
          const payload = await saved.json();
          if (!saved.ok) throw new Error(payload.message || 'Photo verification could not be saved.');
          proofSaved = true;
        } catch (error) { proofFailure = error instanceof Error ? error.message : 'Photo verification could not be saved.'; }
      }
      refresh(getListPropertiesQueryKey(propertyFilters)); refresh(getListPropertiesQueryKey({})); refresh(getGetDashboardQueryKey());
      statusMessage(proofFailure ? `Listing submitted, but its live photo was not saved: ${proofFailure}` : propertyProof && proofSaved ? 'Listing and live location photo submitted for review.' : result.hotelVerificationStatus === 'pending' ? 'Hotel submission received. It will appear in the verified directory only after admin review.' : 'Listing submitted for review.');
      setPropertyProof(null);
      navigate(result.category === 'hotel' || result.category === 'short_let' ? '/hotels' : `/property/${result.id}`);
    } });
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
      agencyName: String(fd.get('agencyName') || '') || undefined, agentBio: String(fd.get('agentBio') || '') || undefined,
    };
    updateProfile.mutate({ data: input }, { onSuccess: () => { refresh(getGetProfileQueryKey()); statusMessage('Your profile details have been saved.'); } });
  };
  const submitPayoutDestination = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    savePayoutDestination.mutate(
      { data: { bankCode: String(fd.get('bankCode') || ''), accountNumber: String(fd.get('accountNumber') || '') } },
      { onSuccess: () => { refresh(getGetPayoutDestinationQueryKey()); form.reset(); statusMessage('Your payout account was verified and saved securely.'); } },
    );
  };
  const submitAgentApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAgentFormError('');
    if (!authSession || !profile.data || !config.data?.supabaseUrl || !config.data.supabaseAnonKey) {
      setAgentFormError('Sign in and finish loading your account before submitting an agent application.'); return;
    }
    const fd = new FormData(event.currentTarget);
    const files = [fd.get('cacDocument'), fd.get('idDocument')];
    if (!files.every((file) => file instanceof File && file.size > 0 && file.size <= 10 * 1024 * 1024 && ['image/jpeg','image/png','application/pdf'].includes(file.type))) {
      setAgentFormError('Upload both CAC and ID documents as PDF, JPG or PNG files under 10 MB each.'); return;
    }
    setAgentSubmitting(true);
    try {
      const evidenceUrls: string[] = [];
      for (const candidate of files) {
        const file = candidate as File;
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
        const objectPath = `${profile.data.id}/${crypto.randomUUID()}-${safeName}`;
        const objectUrl = `${config.data.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/estatehold-kyc/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
        const uploaded = await fetch(objectUrl, {
          method: 'POST',
          headers: { apikey: config.data.supabaseAnonKey, Authorization: `Bearer ${authSession.access_token}`, 'Content-Type': file.type, 'x-upsert': 'false' },
          body: file,
        });
        if (!uploaded.ok) throw new Error('One of the private KYC document uploads failed. Please retry.');
        evidenceUrls.push(objectPath);
      }
      const input: ProfileInput = {
        role: 'agent', fullName: String(fd.get('fullName') || ''), phone: String(fd.get('phone') || ''),
        country: 'Nigeria', state: String(fd.get('state') || ''), town: String(fd.get('town') || ''),
        agencyName: String(fd.get('agencyName') || ''), agentBio: String(fd.get('agentBio') || ''),
        evidenceUrls,
      };
      updateProfile.mutate({ data: input }, {
        onSuccess: () => { setAgentSubmitting(false); refresh(getGetProfileQueryKey()); statusMessage('Application submitted. Awaiting admin approval.'); navigate('/agent-dashboard'); },
        onError: () => { setAgentSubmitting(false); setAgentFormError('Your application could not be saved. Check the Supabase migration and retry.'); },
      });
    } catch (error) {
      setAgentSubmitting(false);
      setAgentFormError(error instanceof Error ? error.message : 'The application could not be submitted.');
    }
  };
  const openKycDocument = async (objectPath: string) => {
    if (!authSession || !config.data?.supabaseUrl || !config.data.supabaseAnonKey) return;
    try {
      const url = `${config.data.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/estatehold-kyc/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(url, { headers: { apikey: config.data.supabaseAnonKey, Authorization: `Bearer ${authSession.access_token}` } });
      if (!response.ok) throw new Error('The KYC document could not be opened.');
      const objectUrl = URL.createObjectURL(await response.blob());
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) { statusMessage(error instanceof Error ? error.message : 'Unable to open this document.'); }
  };
  const reviewAdminProperty = async (propertyId: string, decision: 'approved' | 'rejected') => {
    if (!authSession) return;
    try {
      const response = await fetch(`/api/admin/properties/${encodeURIComponent(propertyId)}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Property review did not complete.');
      setAdminWorkspaceReload(v => v + 1);
      refresh(getListPropertiesQueryKey({}));
      statusMessage(decision === 'approved' ? 'Property approved.' : 'Property rejected.');
    } catch (error) { statusMessage(error instanceof Error ? error.message : 'Property review did not complete.'); }
  };
  const runAdminAction = async (path: string, successMessage: string, confirmMessage?: string) => {
    if (!authSession) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'The action could not be completed.');
      setAdminWorkspaceReload(v => v + 1);
      statusMessage(successMessage);
    } catch (error) {
      statusMessage(error instanceof Error ? error.message : 'The action could not be completed.');
    }
  };
  const confirmEscrowHandover = async (transactionId: string) => {
    if (!authSession) throw new Error('Sign in as the buyer to confirm this escrow handover.');
    const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/escrow-confirmation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authSession.access_token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.message || 'Buyer confirmation could not be recorded.');
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
            <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}estatehold-home-hero.jpg)` }}/>
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20"/>
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent"/>
            <div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-[#b6d6bc]"><MapPin size={13}/>{profileTown}</span>
              <p className="mt-7 text-sm font-medium text-[#adc0b0]">{greeting}</p><h1 className="mt-1 font-display text-4xl font-extrabold leading-[1.08] tracking-[-.04em] sm:text-6xl">A home should<br/><span className="text-[#82cf91]">feel certain.</span></h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#c2ccc3]">Find a place with a location you can trust—and protection you can see.</p>
              <div className="mt-7 flex flex-wrap gap-3"><Link href="/browse" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#16A34A] px-5 text-sm font-bold text-white hover:bg-[#15803d]">Explore properties <ArrowRight size={16}/></Link><Link href="/map" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/20 px-5 text-sm font-bold text-white hover:bg-white/10"><MapPin size={16}/>Open map</Link></div>
              <div className="mt-8 flex items-center gap-2 text-xs text-[#aab9ac]"><ShieldCheck size={15} className="text-[#82cf91]"/>Verified location pins · Visible tenant safeguards</div>
            </div>
          </section>
          <section aria-label="Browse homes by service" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['rent','Rent'],['lease','Lease'],['social','Shared'],['sale','Sale']].map(([intent,label])=><Link key={intent} href={`/browse?intent=${intent}`} className="rounded-2xl border border-[#dfe7df] bg-white px-4 py-4 text-center text-sm font-extrabold text-[#314638] hover:border-[#16A34A] hover:bg-[#f3f8f2]">{label}<span className="mt-1 block text-xs font-medium text-[#738078]">Explore listings</span></Link>)}</section>
          <section className="rounded-2xl border border-[#cfe1d1] bg-[#f4faf4] p-5"><h2 className="font-display text-lg font-extrabold">Register Now</h2><p className="mt-1 text-sm text-[#66756a]">Choose the account path that matches your property journey.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/register-agent" className="rounded-xl bg-[#183b22] px-4 py-2.5 text-sm font-bold text-white">Agent</Link><Link href="/sign-up?role=landlord" className="rounded-xl border border-[#cfdbd0] bg-white px-4 py-2.5 text-sm font-bold">Landlord — managed properties</Link><Link href="/sign-up?role=tenant&managed=1" className="rounded-xl border border-[#cfdbd0] bg-white px-4 py-2.5 text-sm font-bold">Managed tenant</Link></div></section>
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
      case '/hotels': {
        const verifiedHotels = (hotelsQuery.data?.items || []).filter(p =>
          ['hotel','short_let'].includes(p.category) &&
          p.hotelVerificationStatus === 'verified' &&
          p.pinStatus === 'verified' &&
          p.listingModerationStatus === 'approved'
        );
        return <div className="space-y-6">
          <PageIntro eyebrow="Verified accommodation" title="Hotels & short-lets" text="Discover accommodation listings reviewed for both the property and its location."/>
          <Notice>Guest privacy respected. No monitoring inside rooms. Safety check-in is voluntary and requires explicit consent. Hotel CCTV may be used only in disclosed common areas.</Notice>
          {hotelsQuery.isLoading ? <LoadingCard/> : hotelsQuery.isError ? <ErrorState onRetry={() => hotelsQuery.refetch()} error={hotelsQuery.error}/> : verifiedHotels.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{verifiedHotels.map(p=><article key={p.id} className="overflow-hidden rounded-2xl border border-[#e4eae3] bg-white">
            {p.imageUrl ? <img src={p.imageUrl} alt={p.title} className="h-48 w-full object-cover"/> : <div className="flex h-36 items-center justify-center bg-[#e8f5e9]"><Building2 size={38} className="text-[#7e9984]"/></div>}
            <div className="p-5"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#e8f5e9] px-2.5 py-1 text-[11px] font-bold text-[#26723a]">Hotel verified</span><span className="rounded-full bg-[#f2f5f0] px-2.5 py-1 text-[11px] font-bold capitalize text-[#627067]">{p.category === 'short_let' ? 'Short-let' : 'Hotel'}</span></div>
              <h2 className="mt-3 font-display text-xl font-extrabold">{p.title}</h2><p className="mt-1 text-sm text-[#718077]">{p.town}, {p.state}</p><p className="mt-3 font-display text-lg font-extrabold">{money(p.priceNaira)} <span className="font-sans text-xs font-medium text-[#77847a]">{p.priceUnit || 'per night'}</span></p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">{p.hotelHas24HourReception && <span className="rounded-lg bg-[#f1f7f1] px-2.5 py-1.5 text-[#345e3b]">24-hour reception</span>}{p.hotelCctvCommonAreas && p.hotelCctvDisclosed && <span className="rounded-lg bg-[#f1f7f1] px-2.5 py-1.5 text-[#345e3b]">Disclosed common-area CCTV only</span>}</div>
              <p className="mt-3 text-sm leading-6 text-[#6a786e]">{p.description || 'Contact the property for accommodation details.'}</p>
              <div className="mt-4 flex flex-wrap gap-2">{p.emergencyContactPhone && <a href={`tel:${p.emergencyContactPhone}`} className="inline-flex min-h-10 items-center rounded-xl border border-[#dfe7df] px-3 text-sm font-bold text-[#284a30]">Call reception / emergency contact</a>}
              {p.hotelSafetyCheckinAvailable && p.emergencyContactPhone && <div className="mt-2 w-full rounded-xl bg-[#f7f9f5] p-3"><label className="flex items-start gap-2 text-xs leading-5 text-[#59695e]"><input type="checkbox" checked={Boolean(checkInConsents[p.id])} onChange={e=>setCheckInConsents(s=>({...s,[p.id]:e.target.checked}))} className="mt-1 accent-[#16A34A]"/>I consent to request an optional safety check-in via SMS. No location or room activity is shared by Estatehold.</label>{checkInConsents[p.id] && <a className="mt-3 inline-flex text-sm font-bold text-[#18783a]" href={`sms:${encodeURIComponent(p.emergencyContactPhone)}?body=${encodeURIComponent(`I consent to a voluntary safety check-in for my stay at ${p.title}.`)}`}>Open SMS to request check-in</a>}</div>}</div>
            </div></article>)}</div> : <EmptyState icon={Building2} title="No verified stays yet" body="Only accommodation with approved hotel and location verification appears here. Owners can submit a hotel or short-let for review below."/>}
          <section className="mx-auto max-w-3xl space-y-4"><PageIntro eyebrow="For hotel & short-let owners" title="Submit an accommodation listing" text="CAC and contact details are private to the verification team. Approval is required before a listing appears in the verified directory."/>
            {!authSession ? <Notice tone="amber">Sign in with an owner or agent account to submit a listing. <Link href="/sign-in" className="font-bold underline">Sign in</Link></Notice> : <form onChange={syncListingCoordinates} onSubmit={submitWith(submitProperty)} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Accommodation name" name="title" required/><SelectField label="Type" name="category" options={[['hotel','Hotel'],['short_let','Short-let']]}/><Field label="CAC registration number" name="hotelCacNumber" required/><Field label="Public reception / emergency contact" name="emergencyContactPhone" type="tel" required placeholder="+234…"/><Field label="State" name="state" required/><Field label="City / town" name="town" required/><Field label="Street address" name="address" required/><Field label="Price (₦)" name="priceNaira" type="number" min={1} required/><Field label="Price unit" name="priceUnit" defaultValue="per night"/><Field label="Guest terms / house rules URL" name="premisesRulesUrl" type="url" required placeholder="https://…"/><Field label="Latitude" name="latitude" type="number" step={0.000001} required/><Field label="Longitude" name="longitude" type="number" step={0.000001} required/></div>
              <div className="space-y-3 rounded-xl bg-[#f7f9f5] p-4 text-sm"><label className="flex gap-2"><input type="checkbox" name="hotelHas24HourReception" className="mt-1 accent-[#16A34A]"/>24-hour reception is available</label><label className="flex gap-2"><input type="checkbox" name="hotelCctvCommonAreas" className="mt-1 accent-[#16A34A]"/>CCTV is used in common areas</label><label className="flex gap-2"><input type="checkbox" name="hotelSafetyCheckinAvailable" className="mt-1 accent-[#16A34A]"/>Offer voluntary safety check-in by SMS</label><label className="flex gap-2 font-semibold"><input type="checkbox" name="hotelCctvDisclosed" required className="mt-1 accent-[#16A34A]"/>I confirm there is no monitoring inside guest rooms and any CCTV is disclosed and limited to common areas.</label></div>
               <PropertyPhotoCapture listingLatitude={listingCoordinates.latitude} listingLongitude={listingCoordinates.longitude} proof={propertyProof} onProofChange={setPropertyProof}/>
               {propertyProofError && <Notice tone="red">{propertyProofError}</Notice>}
              <TextArea label="Accommodation details" name="description" placeholder="Share information guests need before booking."/>
              {createProperty.isError && <Notice tone="red">Could not submit. Sign in with an owner/agent account and check the required listing details.</Notice>}
              <Button type="submit" disabled={createProperty.isPending}>{createProperty.isPending ? 'Submitting…' : 'Submit for verification'}</Button>
            </form>}
          </section>
        </div>;
      }
      case '/register-agent':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="Agent onboarding" title="Register as an agent" text="Submit your agency details for review. You can add properties after an administrator approves your application."/>
          {profile.data?.role === 'agent' && profile.data.verificationStatus === 'pending' ? <Notice tone="amber">Awaiting Approval. Your documents are held in private storage for the verification team.</Notice> : !authSession ? <Notice tone="amber">Create an account or sign in before uploading documents. <Link href="/sign-up" className="font-bold underline">Create account</Link></Notice> :
          <form onSubmit={submitAgentApplication} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-8"><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" name="fullName" required defaultValue={profile.data?.fullName}/><Field label="Phone" name="phone" required defaultValue={profile.data?.phone}/><Field label="Email" name="email" type="email" readOnly defaultValue={profile.data?.email}/><Field label="City / town" name="town" required placeholder="Enugu, Port Harcourt, Lagos…"/><Field label="State" name="state" required/><Field label="Agency name" name="agencyName" required/><Field label="CAC certificate (PDF, JPG or PNG; max 10 MB)" name="cacDocument" type="file" required/><Field label="Government ID card (PDF, JPG or PNG; max 10 MB)" name="idDocument" type="file" required/></div><TextArea label="Agent bio" name="agentBio" placeholder="Describe your areas of practice and service."/>
            <Notice>KYC documents are uploaded to private storage and visible only to you and authorised reviewers. Do not upload BVN or NIN here.</Notice>{agentFormError && <Notice tone="red">{agentFormError}</Notice>}
            <Button type="submit" disabled={agentSubmitting || updateProfile.isPending}>{agentSubmitting || updateProfile.isPending ? 'Submitting securely…' : 'Submit agent application'}</Button>
          </form>}</div>;
      case '/agent-dashboard':
        if (!authSession) return <div className="space-y-4"><PageIntro eyebrow="Agent workspace" title="Sign in to continue" text="Agent tools are available to approved Estatehold agents."/><Link className="font-bold text-[#18783a] underline" href="/sign-in">Sign in</Link></div>;
        if (profile.isLoading) return <LoadingCard/>;
        if (profile.data?.role !== 'agent') return <div className="space-y-4"><PageIntro eyebrow="Agent workspace" title="Agent access required" text="Submit an agent application before opening the agent dashboard."/><Link className="font-bold text-[#18783a] underline" href="/register-agent">Register as an agent</Link></div>;
        if (profile.data.verificationStatus !== 'verified') return <div className="space-y-4"><PageIntro eyebrow="Agent workspace" title="Awaiting Approval" text="Property publishing unlocks after the verification team approves your CAC and ID documents."/><Link className="font-bold text-[#18783a] underline" href="/register-agent">Review your application</Link></div>;
        return <div className="space-y-5"><PageIntro eyebrow="Agent workspace" title={`Welcome, ${profile.data.fullName}`} text="Your agent account is approved. Add a property listing or explore current listings."/><Notice>Your verified account can submit listings. Each property remains under moderation until reviewed.</Notice><Link href="/list-property" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#0B0F0E] px-5 text-sm font-bold text-white"><Plus size={16}/>Add a property</Link></div>;
      case '/browse': {
        return <BrowsePage query={propertiesQuery} properties={filteredProperties} profileTown={profileTown} onRetry={() => propertiesQuery.refetch()}/>;
      }
      case '/map':
        return <MapSearchPage properties={filteredProperties} loading={propertiesQuery.isLoading} failed={propertiesQuery.isError} apiKey={googleMapsKey} mapsState={googleMapsState} onRetry={() => propertiesQuery.refetch()}/>;
      case '/list-property':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="For owners & agents" title="Add a property" text="Share accurate details. Location verification makes the listing clearer for everyone."/><Notice>Your pin location is part of the listing review. Use the property’s real coordinates; new pins show as pending until verified.</Notice>
          <form onChange={syncListingCoordinates} onSubmit={submitWith(submitProperty)} className="space-y-5 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Listing title" name="title" required placeholder="e.g. Two-bedroom apartment near..." /><SelectField label="Property type" name="category" options={[['home','Home'],['land','Land'],['warehouse','Warehouse'],['complex','Complex'],['shopping_mall','Shopping mall'],['hotel','Hotel'],['short_let','Short-let'],['school','School'],['hospital','Hospital'],['filling_station','Filling station'],['worship_center','Worship center'],['factory','Factory'],['multipurpose_hall','Multipurpose hall'],['custom','Other / custom']]} />
              <Field label="Custom property type (optional)" name="customType" placeholder="Describe the type"/><SelectField label="Listing intent" name="intent" options={[['sale','For sale'],['rent','For rent'],['lease','For lease'],['social','Shared housing']]} />
              <Field label="State" name="state" required placeholder="Lagos"/><Field label="Town / city" name="town" required placeholder="Ikeja"/><Field label="Street address" name="address" placeholder="Street, estate or landmark"/><Field label="Price in naira" name="priceNaira" type="number" min={1} required placeholder="0"/><Field label="Price unit" name="priceUnit" placeholder="per year, total…"/><Field label="Bedrooms" name="bedrooms" type="number" min={0}/><Field label="Bathrooms" name="bathrooms" type="number" min={0}/><Field label="Size (m²)" name="sizeSqm" type="number" min={0}/><Field label="Latitude" name="latitude" type="number" step={0.000001} required placeholder="6.5244"/><Field label="Longitude" name="longitude" type="number" step={0.000001} required placeholder="3.3792"/><Field label="Image URL (optional)" name="imageUrl" placeholder="https://…"/><Field label="Premises rules URL (optional)" name="premisesRulesUrl" placeholder="https://…"/></div>
            <PropertyPhotoCapture listingLatitude={listingCoordinates.latitude} listingLongitude={listingCoordinates.longitude} proof={propertyProof} onProofChange={setPropertyProof}/>
            {propertyProofError && <Notice tone="red">{propertyProofError}</Notice>}
            <TextArea label="Description" name="description" placeholder="Share the details a renter or buyer should know."/>
            {createProperty.isError && <Notice tone="red">The listing could not be submitted. Please review the fields and try again.</Notice>}
            <Button type="submit" disabled={createProperty.isPending} testId="button-submit-property">{createProperty.isPending ? <><LoaderCircle className="animate-spin" size={16}/>Saving listing…</> : 'Submit for listing review'}</Button>
          </form></div>;
      case '/request-property':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="We’ll help you look" title="Request a property" text="Set the budget and location you’re working with. Track your request from one place."/>
          <form onSubmit={submitWith(submitRequest)} className="grid gap-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:grid-cols-2 sm:p-8"><SelectField label="Request type" name="requestType" options={[['location_sourcing','Find a property in a location'],['custom_category','Find a specific property type']]}/><Field label="Custom category" name="customCategory" placeholder="e.g. Accessible bungalow"/><Field label="Preferred town" name="desiredTown" required placeholder="Ikeja"/><Field label="LGA" name="desiredLga" required placeholder="Ikeja"/><Field label="State" name="desiredState" required placeholder="Lagos"/><Field label="Neighborhood (optional)" name="neighborhood" placeholder="Near a school, bus route…"/><Field label="Budget (₦)" name="budgetNaira" type="number" required min={1} placeholder="Your budget"/><SelectField label="Urgency" name="urgency" options={[['standard','Standard'],['urgent','Urgent']]}/>
            {createRequest.isError && <div className="sm:col-span-2"><Notice tone="red">Request didn’t send. Check required fields and retry.</Notice></div>}<div className="sm:col-span-2"><Button type="submit" disabled={createRequest.isPending}>{createRequest.isPending ? 'Sending request…' : 'Send sourcing request'} <ArrowRight size={15}/></Button></div></form></div>;
      case '/requests':
        return <RequestsHub query={requestsQuery}/>;
      case '/social-housing':
        return <SocialHousingPage query={socialQuery}/>;
      case '/processing-fees':
        return <ProcessingFeesPage query={processingFeesQuery}/>;
      case '/offices':
        return <OfficesPage apiKey={googleMapsKey} mapsState={googleMapsState}/>;
      case '/complaints/new':
        return <div className="mx-auto max-w-3xl space-y-5"><PageIntro eyebrow="Tenant protection" title="Lodge a complaint" text="Tell us what happened. Your submission will enter the appropriate review queue."/><Notice>Describe the issue clearly and include only evidence links you’re comfortable sharing. Estatehold does not replace emergency services or legal advice.</Notice>
          <form onSubmit={submitWith(fd=>{
            const input: ComplaintInput = { against: String(fd.get('against')) as ComplaintInput['against'], complaintType: String(fd.get('complaintType')) as ComplaintInput['complaintType'], description: String(fd.get('description')), propertyId: String(fd.get('propertyId') || '') || undefined, evidenceUrls: String(fd.get('evidenceUrls') || '').split(',').map(s=>s.trim()).filter(Boolean) };
            createComplaint.mutate({data:input},{onSuccess:()=>{refresh(getListComplaintsQueryKey());statusMessage('Complaint lodged for review.');navigate('/');}});
          })} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-8"><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Complaint concerns" name="against" options={[['landlord','Landlord'],['agent','Agent'],['tenant','Tenant'],['attorney','Attorney']]}/><SelectField label="Issue type" name="complaintType" options={[['harassment','Harassment'],['agent_misconduct','Agent misconduct'],['breach_of_rules','Breach of rules'],['service_failure','Service failure']]}/><Field label="Property ID (optional)" name="propertyId" placeholder="Listing reference"/><Field label="Evidence URLs (comma separated)" name="evidenceUrls" placeholder="https://…"/></div><TextArea label="What happened?" name="description" required placeholder="Include dates, key details and what resolution you are seeking."/>
            {createComplaint.isError && <Notice tone="red">We couldn’t lodge this complaint. Please try again.</Notice>}<Button type="submit" disabled={createComplaint.isPending}>{createComplaint.isPending ? 'Submitting…' : 'Submit complaint'} <ArrowRight size={15}/></Button></form></div>;
      case '/wallet':
        return <WalletPage quote={feeQuote} onQuote={setFeeQuote} calc={calculateFees} payment={initializePayment} paymentResult={paymentResult} setPayment={setPaymentResult} onConfirmEscrow={confirmEscrowHandover} canConfirmEscrow={!!authSession} />;
      case '/installment-calculator':
        return <InstallmentPage quote={installmentQuote} onQuote={setInstallmentQuote} calc={calculateInstallments} canApplyForLoan={profile.data?.role==='represented_tenant'}/>;
      case '/profile':
        return <ProfilePage profile={profile} updateProfile={updateProfile} onSubmit={submitProfile} authSession={authSession} onLogout={logout} payoutBanks={payoutBanks} payoutDestination={payoutDestination} savePayoutDestination={savePayoutDestination} onSavePayout={submitPayoutDestination}/>;
      case '/poa/landlord':
      case '/poa/tenant':
        return <PoaPage tenant={location.includes('tenant')}/>;
      case '/recovery':
        return <RecoveryPage/>;
      case '/tenancy-agreement':
        return <AgreementPage properties={propertiesQuery.data?.items || dashboard.data?.items || []} mutation={createAgreement} result={createdAgreement} onResult={setCreatedAgreement}/>;
      case '/landlord-kyc':
        return <LandlordKycPage authSession={authSession} profile={profile.data} config={config.data}/>;
      case '/admin':
        if (!authSession) return <div className="space-y-4"><PageIntro eyebrow="Operations" title="Admin sign-in required" text="Use your Estatehold administrator account to open review tools."/><Link href="/sign-in" className="font-bold text-[#18783a] underline">Sign in</Link></div>;
        if (profile.isLoading) return <LoadingCard/>;
        if (profile.data?.role !== 'admin') return <div className="space-y-4"><PageIntro eyebrow="Operations" title="Admin access required" text="This review desk is restricted to approved Estatehold administrators."/><Link href="/" className="font-bold text-[#18783a] underline">Return to marketplace</Link></div>;
        return <div className="space-y-6"><PageIntro eyebrow="Operations" title="Review desk" text="Operational queues and compliance controls. Access is governed by your Estatehold role."/><Notice tone="amber">Escrow can be released only after the buyer confirms handover and an administrator records compliance approval. Agent commissions transfer only after release.</Notice>
          {adminQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><LoadingCard/><LoadingCard/><LoadingCard/></div> : adminQuery.isError ? <ErrorState onRetry={() => adminQuery.refetch()}/> : adminQuery.data && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Pending KYC',adminQuery.data.pendingKyc,BadgeCheck],['Delisting reviews',adminQuery.data.pendingDelistings,Building2],['Open complaints',adminQuery.data.openComplaints,MessageSquareWarning],['Held escrows',adminQuery.data.heldEscrows,LockKeyhole],['Open sourcing requests',adminQuery.data.openRequests,Compass],['Attorney reviews',adminQuery.data.attorneyReviews,FileCheck2]].map(([name,count,Icon])=>{const I=Icon as typeof Home; return <div key={String(name)} className="rounded-2xl border border-[#e4eae3] bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#65746a]">{String(name)}</span><I size={18} className="text-[#16A34A]"/></div><p className="mt-3 font-display text-3xl font-extrabold">{String(count)}</p></div>})}</div>}
           <div className="rounded-3xl border border-[#e4eae3] bg-white p-4">
              <div className="flex gap-2 overflow-x-auto">{['Pending Agents','Landlord KYC','All Agents','Properties','Users','Payments','Agent payouts'].map(tab=><button key={tab} onClick={()=>{setAdminWorkspaceTab(tab);if(tab==='Pending Agents')document.getElementById('pending-agents-queue')?.scrollIntoView({behavior:'smooth'});}} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${adminWorkspaceTab===tab?'bg-[#0B0F0E] text-white':'bg-[#f3f6f1] text-[#516256]'}`}>{tab}</button>)}</div>
             {adminWorkspaceTab!=='Pending Agents' && <div className="mt-4">
               {adminWorkspaceLoading ? <LoadingCard/> : adminWorkspaceError ? <Notice tone="red">{adminWorkspaceError}</Notice> : !adminWorkspace ? <p className="text-sm text-[#718077]">Admin data is unavailable.</p> :
                 adminWorkspaceTab==='Landlord KYC' ? landlordKycQueue.isLoading ? <LoadingCard/> : landlordKycQueue.isError ? <ErrorState onRetry={()=>landlordKycQueue.refetch()} error={landlordKycQueue.error}/> : landlordKycQueue.data?.items.length ? <div className="divide-y divide-[#edf1ec]">{landlordKycQueue.data.items.map(item=><div key={item.userId} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b className="text-sm">{item.fullName}</b><p className="mt-1 text-xs text-[#718077]">NIN {item.maskedNin||'not available'} · {item.ninVerified?'Verified':'Not verified'} · Indemnity {item.indemnitySigned?'signed':'not signed'}</p><p className="mt-1 text-xs text-[#718077]">Review: {item.reviewStatus} · Submitted {new Date(item.createdAt).toLocaleDateString()}</p></div><div className="flex flex-wrap gap-2">{item.propertyDocUrl&&<Button variant="outline" onClick={()=>openKycDocument(item.propertyDocUrl!)}>View property document</Button>}{item.affidavitUrl&&<Button variant="outline" onClick={()=>openKycDocument(item.affidavitUrl!)}>View affidavit</Button>}</div></div><div className="mt-3 flex gap-2"><Button onClick={()=>reviewLandlordKyc.mutate({userId:item.userId,data:{decision:'approved'}},{onSuccess:()=>{refresh(getListAdminLandlordKycQueueQueryKey());statusMessage('Landlord KYC approved.');}})} disabled={reviewLandlordKyc.isPending||!item.indemnitySigned}>Approve</Button><Button variant="danger" onClick={()=>reviewLandlordKyc.mutate({userId:item.userId,data:{decision:'rejected'}},{onSuccess:()=>{refresh(getListAdminLandlordKycQueueQueryKey());statusMessage('Landlord KYC rejected.');}})} disabled={reviewLandlordKyc.isPending}>Reject</Button></div></div>)}</div> : <p className="text-sm text-[#718077]">No landlord KYC applications are waiting.</p> :
                 adminWorkspaceTab==='All Agents' ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="text-xs text-[#718077]"><th className="p-2">Agent</th><th className="p-2">Agency</th><th className="p-2">City</th><th className="p-2">Status</th></tr></thead><tbody>{adminWorkspace.agents.map(a=><tr key={a.id} className="border-t border-[#edf1ec]"><td className="p-2">{a.fullName}<span className="block text-xs text-[#718077]">{a.email}</span></td><td className="p-2">{a.agencyName||'—'}</td><td className="p-2">{a.town||'—'}</td><td className="p-2 capitalize">{a.verificationStatus||'unverified'}</td></tr>)}</tbody></table></div> :
                 adminWorkspaceTab==='Properties' ? <div className="divide-y divide-[#edf1ec]">{adminWorkspace.properties.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><b className="text-sm">{p.title||'Untitled property'}</b><p className="text-xs text-[#718077]">{p.category} · {p.town}, {p.state} · {p.moderationStatus}</p></div>{p.moderationStatus==='pending'&&<div className="flex gap-2"><Button onClick={()=>reviewAdminProperty(p.id,'approved')}>Approve</Button><Button variant="danger" onClick={()=>reviewAdminProperty(p.id,'rejected')}>Reject</Button></div>}</div>)}</div> :
                 adminWorkspaceTab==='Users' ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="text-xs text-[#718077]"><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Verification</th></tr></thead><tbody>{adminWorkspace.users.map(u=><tr key={u.id} className="border-t border-[#edf1ec]"><td className="p-2">{u.fullName||'—'}<span className="block text-xs text-[#718077]">{u.email}</span></td><td className="p-2 capitalize">{u.role}</td><td className="p-2 capitalize">{u.verificationStatus}</td></tr>)}</tbody></table></div> :
                  adminWorkspaceTab==='Agent payouts' ? <div className="divide-y divide-[#edf1ec]">{adminWorkspace.agentPayouts.length ? adminWorkspace.agentPayouts.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><b className="text-sm">{money(p.amountNaira)} · <span className="capitalize">{p.status.replaceAll('_',' ')}</span></b><p className="mt-1 text-xs text-[#718077]">Transaction {p.transactionId} · Transfer ref {p.transferReference}</p>{p.recipientBankName&&<p className="mt-1 text-xs text-[#718077]">Recipient: {p.recipientBankName} · account ending {p.recipientAccountLast4}</p>}{p.providerStatus&&<p className="mt-1 text-xs text-[#718077]">Paystack: {p.providerStatus}</p>}{p.failureMessage&&<p className="mt-1 text-xs font-semibold text-[#9b3434]">{p.failureMessage}</p>}</div>{['initiating','pending','reconciliation_required'].includes(p.status)&&<Button variant="outline" onClick={()=>runAdminAction(`/api/admin/agent-commission-payouts/${encodeURIComponent(p.id)}/reconcile`,'Transfer status reconciled.')}>Reconcile</Button>}</div>) : <p className="py-3 text-sm text-[#718077]">No agent commission transfers have been approved.</p>}</div> :
                  <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead><tr className="text-xs text-[#718077]"><th className="p-2">Payment</th><th className="p-2">Status</th><th className="p-2">Amount</th><th className="p-2">Agent commission</th><th className="p-2">Platform fee</th><th className="p-2">Payout action</th></tr></thead><tbody>{adminWorkspace.payments.map(p=>{const payout=adminWorkspace.agentPayouts.find(item=>item.transactionId===p.id);return <tr key={p.id} className="border-t border-[#edf1ec]"><td className="p-2 font-mono-ui text-xs">{p.id}</td><td className="p-2 capitalize">{p.status}</td><td className="p-2">{money(p.amountNaira)}</td><td className="p-2">{money(p.agentFeeNaira)}</td><td className="p-2">{money(p.platformFeeNaira)}</td><td className="p-2">{payout?<span className="capitalize">{payout.status.replaceAll('_',' ')}</span>:Number(p.agentFeeNaira)>0?<Button onClick={()=>runAdminAction(`/api/admin/agent-commission-payouts/${encodeURIComponent(p.id)}/approve`,'Commission payout attempt recorded. Check Agent payouts for the provider result.','This will initiate a one-time agent commission transfer if escrow has been released. Continue?')}>Approve & transfer</Button>:'—'}</td></tr>})}</tbody></table></div>}
             </div>}
           </div>
           <div className="grid gap-5 lg:grid-cols-2"><section id="pending-agents-queue" className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Pending agent applications</h2>{kycQueue.isLoading ? <div className="mt-4"><LoadingCard/></div> : kycQueue.isError ? <div className="mt-4"><ErrorState onRetry={()=>kycQueue.refetch()} error={kycQueue.error}/></div> : (kycQueue.data?.items || []).filter(a=>a.role==='agent').length ? <div className="mt-4 divide-y divide-[#edf1ec]">{(kycQueue.data?.items || []).filter(a=>a.role==='agent').map(a=><div key={a.profileId} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><b className="text-sm">{a.fullName}</b><p className="mt-1 text-xs text-[#718077]">{a.agencyName || 'Agency not listed'} · {a.email || 'No email'} · {a.status}</p><p className="mt-1 text-xs leading-5 text-[#718077]">{a.agentBio || 'No bio supplied.'}</p></div><div className="flex flex-wrap gap-2">{(a.evidenceUrls || []).map((path, index)=><Button key={path} variant="outline" onClick={()=>openKycDocument(path)}>{index===0?'View CAC':'View ID'}</Button>)}</div></div><div className="mt-3 flex gap-2"><Button onClick={()=>reviewKyc.mutate({profileId:a.profileId,data:{decision:'verified'}},{onSuccess:()=>{refresh(getListAdminKycQueueQueryKey());refresh(getGetAdminDashboardQueryKey());statusMessage('Agent approved.')}})} disabled={reviewKyc.isPending}>Approve</Button><Button variant="danger" onClick={()=>reviewKyc.mutate({profileId:a.profileId,data:{decision:'rejected'}},{onSuccess:()=>{refresh(getListAdminKycQueueQueryKey());statusMessage('Agent application rejected.')}})} disabled={reviewKyc.isPending}>Reject</Button></div></div>)}</div> : <p className="mt-4 text-sm text-[#718077]">No pending agent applications.</p>}</section>
             <section className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Hotel & short-let verification</h2>{hotelQueue.isLoading ? <div className="mt-4"><LoadingCard/></div> : hotelQueue.isError ? <div className="mt-4"><ErrorState onRetry={()=>hotelQueue.refetch()} error={hotelQueue.error}/></div> : hotelQueue.data?.items.length ? <div className="mt-4 divide-y divide-[#edf1ec]">{hotelQueue.data.items.map(h=><div key={h.propertyId} className="py-4"><b className="text-sm">{h.title}</b><p className="mt-1 text-xs text-[#718077]">{h.category==='short_let'?'Short-let':'Hotel'} · {h.town}, {h.state} · CAC {h.cacNumber}</p><a href={`tel:${h.emergencyContactPhone}`} className="mt-1 inline-block text-xs font-bold text-[#18783a]">{h.emergencyContactPhone}</a><div className="mt-3 flex gap-2"><Button onClick={()=>reviewHotel.mutate({propertyId:h.propertyId,data:{decision:'verified'}},{onSuccess:()=>{refresh(getListAdminHotelVerificationQueueQueryKey());refresh(getListPropertiesQueryKey({}));statusMessage('Accommodation listing verified.')}})} disabled={reviewHotel.isPending}>Verify</Button><Button variant="danger" onClick={()=>reviewHotel.mutate({propertyId:h.propertyId,data:{decision:'rejected'}},{onSuccess:()=>refresh(getListAdminHotelVerificationQueueQueryKey())})} disabled={reviewHotel.isPending}>Reject</Button></div></div>)}</div> : <p className="mt-4 text-sm text-[#718077]">No accommodation reviews are waiting.</p>}</section>
           </div>
           <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Complaint queue</h2>{complaintsQuery.isLoading ? <div className="mt-4"><LoadingCard/></div> : complaintsQuery.isError ? <div className="mt-4"><ErrorState onRetry={()=>complaintsQuery.refetch()} error={complaintsQuery.error}/></div> : complaintsQuery.data?.items.length ? <div className="mt-4 divide-y divide-[#edf1ec]">{complaintsQuery.data.items.map(c=><div key={c.id} className="py-3"><div className="flex justify-between"><b className="text-sm capitalize">{c.complaintType.replaceAll('_',' ')}</b><span className="text-xs capitalize text-[#66766a]">{c.status}</span></div><p className="mt-1 line-clamp-2 text-sm text-[#718077]">{c.description}</p></div>)}</div> : <p className="mt-4 text-sm text-[#718077]">No complaints in this view.</p>}</section>
            <section className="rounded-3xl border border-[#e4eae3] bg-white p-5"><h2 className="font-display text-xl font-extrabold">Held escrow</h2><p className="mt-1 text-sm text-[#718077]">Record compliance approval, then release only after buyer confirmation and full payment.</p><form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();const id=String(new FormData(e.currentTarget).get('transactionId'));releaseEscrow.mutate({transactionId:id},{onSuccess:()=>{statusMessage('Escrow released. Agent commission eligibility can now be reviewed.');setAdminWorkspaceReload(v=>v+1);},onError:()=>statusMessage('Release requires full payment, buyer confirmation, and compliance approval.')});}}><input data-testid="input-escrow-id" name="transactionId" required placeholder="Transaction ID" className="w-full rounded-xl border border-[#dfe6df] px-3 py-2 text-sm"/><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>{const id=(document.querySelector<HTMLInputElement>('[data-testid="input-escrow-id"]')?.value||'').trim();if(id)void runAdminAction(`/api/admin/transactions/${encodeURIComponent(id)}/escrow-compliance-approval`,'Compliance approval recorded.');}}>Approve compliance</Button><Button type="submit" variant="outline" disabled={releaseEscrow.isPending}>{releaseEscrow.isPending?'Releasing…':'Release escrow'}</Button></div></form><p className="mt-3 text-xs text-[#8c6c39]">Both actions are audited. The buyer must separately confirm completed execution, documentation, and handover.</p></section></div>
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
      <Link href="/" className="flex items-center gap-3 px-2"><LogoMark/><span><b className="block font-display text-[17px] font-extrabold">estatehold</b><span className="block text-[9px] tracking-wide text-[#90a394]">TRUST SECURITY PROPERTY HOLDING</span></span></Link>
      <div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#85978a]">Marketplace</div>
      <nav className="mt-2 space-y-1">{[['/','Home',Home],['/browse','Explore',Search],['/hotels','Hotels & short-lets',Building2],['/map','Map search',MapPin],['/social-housing','Shared ownership',HeartHandshake],['/requests','My requests',ListChecks]].map(([href,label,Icon])=>{const I=Icon as typeof Home;return <Link key={String(href)} href={String(href)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${location===href?'bg-[#1b2c20] text-[#8be19b]':'text-[#c3cec4] hover:bg-white/[.06]'}`}><I size={17}/>{String(label)}</Link>})}</nav>
      <div className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#85978a]">Your tools</div>
      <nav className="mt-2 space-y-1">{[['/register-agent','Register as an agent',BadgeCheck],['/agent-dashboard','Agent dashboard',Activity],['/request-property','Source a property',Compass],['/wallet','Wallet & fees',Wallet],['/installment-calculator','Installment planner',Calculator],['/profile','My profile',BadgeCheck],['/complaints/new','Report a concern',LifeBuoy],['/tenancy-agreement','Tenancy draft',FileText],['/poa/landlord','Landlord POA',FileText],['/poa/tenant','Tenant POA',FileCheck2],['/recovery','Recovery guide',Shield],['/admin','Operations desk',Activity]].map(([href,label,Icon])=>{const I=Icon as typeof Home;return <Link key={String(href)} href={String(href)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${location===href?'bg-[#1b2c20] text-[#8be19b]':'text-[#c3cec4] hover:bg-white/[.06]'}`}><I size={17}/>{String(label)}</Link>})}</nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#dce9dd]"><ShieldCheck size={15} className="text-[#7bd38c]"/>A little more certainty</div><p className="mt-2 text-xs leading-5 text-[#9aab9c]">Check the pin, read the terms, know your next step.</p><Link href="/recovery" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#8be19b]">Protection guide <ArrowRight size={13}/></Link></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="no-print sticky top-0 z-30 border-b border-[#e4eae3] bg-[#f7f8f4]/90 backdrop-blur-xl"><div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between px-4 sm:px-7">
        <div className="flex items-center gap-3 lg:hidden"><Link href="/" className="flex items-center gap-2"><LogoMark small/><span className="font-display font-extrabold">estatehold</span></Link></div>
        <div className="hidden items-center gap-2 text-xs font-medium text-[#718077] lg:flex"><MapPin size={14} className="text-[#16A34A]"/>Showing homes around <strong className="text-[#26372b]">{profileTown}</strong><ChevronDown size={14}/></div>
        <div className="ml-auto flex items-center gap-2"><Link href="/hotels" className="hidden text-xs font-bold text-[#2e6840] md:inline-flex">Hotels</Link><Link href="/register-agent" className="hidden text-xs font-bold text-[#2e6840] md:inline-flex">Become an agent</Link><Link href="/list-property" className="hidden items-center gap-2 rounded-xl bg-[#0B0F0E] px-4 py-2.5 text-xs font-bold text-white sm:inline-flex"><Plus size={15}/>List a property</Link>{authSession ? <button onClick={logout} className="flex h-10 items-center gap-2 rounded-full border border-[#dfe6df] bg-white px-3 text-xs font-bold" data-testid="button-sign-out"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f5e9] text-[#26723a]">{(authSession.user?.email||'E')[0].toUpperCase()}</span><span className="hidden sm:inline">Sign out</span></button> : <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-xl border border-[#dfe6df] bg-white px-3 py-2.5 text-xs font-bold text-[#304039]"><LogIn size={14}/>Sign in</Link>}</div>
      </div></header>
      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-7 sm:px-7 sm:pt-9 lg:pb-12">
        <div className="mb-6 flex items-start justify-between gap-4"><div className="min-w-0">{location !== '/' && routeTitle && <p className="text-xs font-bold uppercase tracking-[.14em] text-[#67806b]">Estatehold <span className="px-1 text-[#a4b0a5]">/</span>{routeTitle}</p>}</div>{health.data && <span className="hidden items-center gap-1.5 rounded-full bg-[#e8f5e9] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#26723a] xl:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]"/>{health.data.status}</span>}</div>
        {notice && <div className="mb-5"><Notice>{notice}</Notice></div>}
        <div className="page-enter">{content()}</div>
         <footer className="mt-14 border-t border-[#e3e9e2] pt-5 text-xs text-[#89958b]">Estatehold by Onyenic Civic Company Limited · TRUST SECURITY PROPERTY HOLDING <span className="mx-2">·</span> Documents are drafts pending Nigerian legal review</footer>
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
function BrowsePage({ query, properties, profileTown, onRetry }: { query: UseQueryResult<ListProperties200>; properties: Property[]; profileTown: string; onRetry: () => void }) {
  const [search, setSearch] = useState('');
  const [intent, setIntent] = useState(() => new URLSearchParams(window.location.search).get('intent') || 'all');
  const visible = properties.filter(p => (!search || `${p.title} ${p.town} ${p.state} ${p.category}`.toLowerCase().includes(search.toLowerCase())) && (intent==='all'||p.intent===intent));
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><PageIntro eyebrow="Find your next place" title="Homes worth a closer look" text={`Browse property listings and start around ${profileTown}. Verified pins are clearly marked.`}/><Link href="/request-property" className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-[#28763d]">Can’t find it? Request a search <ArrowRight size={14}/></Link></div>
    {query.data?.dataSource === 'mock' && <Notice tone="amber">Live data offline — these clearly marked samples are not live listings. Verify availability and ownership before relying on any details.</Notice>}
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e4eae3] bg-white p-3 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-2 rounded-xl bg-[#f4f7f3] px-3"><Search size={17} className="text-[#718077]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by town, title or type" className="h-11 w-full bg-transparent text-sm outline-none" data-testid="input-search-property"/></label><div className="flex items-center gap-2 overflow-x-auto">{[['all','All homes'],['rent','Rent'],['lease','Lease'],['social','Shared'],['sale','Sale']].map(([val,label])=><button key={val} onClick={()=>setIntent(val)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${intent===val?'bg-[#e8f5e9] text-[#26723a]':'text-[#758078] hover:bg-[#f4f7f3]'}`}>{label}</button>)}</div><span className="hidden items-center gap-1 text-xs text-[#7b887e] md:inline-flex"><SlidersHorizontal size={14}/>Location first</span></div>
    {query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><LoadingCard/><LoadingCard/><LoadingCard/></div> : query.isError ? <ErrorState onRetry={onRetry}/> : visible.length ? <><p className="text-xs font-semibold text-[#77847a]">{visible.length} properties to explore</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(p=><PropertyCard key={p.id} property={p}/>)}</div></> : <EmptyState icon={Search} title={properties.length?'No matching places':'No listings to show yet'} body={properties.length?'Try a different search or adjust the intent filter.':'Current listings will appear here once available.'} action={properties.length?<button className="text-sm font-bold text-[#16783a]" onClick={()=>{setSearch('');setIntent('all')}}>Clear search filters</button>:undefined}/>}</div>;
}
function SocialHousingPage({ query }: { query: UseQueryResult<ListSocialHousingUnits200> }) {
  const [unitCategory, setUnitCategory] = useState('all');
  const items = query.data?.items.filter(unit => unitCategory === 'all' || unit.unitType.toLowerCase().includes(unitCategory)) || [];
  return <div className="space-y-6"><PageIntro eyebrow="A smaller step toward ownership" title="Shared housing units" text="Explore live fractional units and their current availability. Prices and status come directly from listed units."/><Notice>Unit availability and terms should be confirmed with the property team before payment. Payments remain in test mode.</Notice>
    <div className="flex flex-wrap gap-2" aria-label="Filter shared units by category">{[['all','All units'],['home','Home'],['shop','Shop'],['warehouse','Warehouse'],['estate','Estate']].map(([value,label])=><button key={value} onClick={()=>setUnitCategory(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${unitCategory===value?'bg-[#183b22] text-white':'border border-[#dce5dd] bg-white text-[#435449]'}`}>{label}</button>)}</div>
    {query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><LoadingCard/><LoadingCard/></div> : query.isError ? <ErrorState onRetry={()=>query.refetch()}/> : items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(unit=><article key={unit.id} className="overflow-hidden rounded-2xl border border-[#e4eae3] bg-white">{unit.imageUrl?<img src={unit.imageUrl} alt={unit.propertyTitle} className="h-48 w-full object-cover"/>:<div className="flex h-48 items-center justify-center bg-[linear-gradient(135deg,#e8f5e9,#d8e5da)]"><Landmark size={48} className="text-[#77967b]" strokeWidth={1.2}/></div>}<div className="p-5"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-[11px] font-bold capitalize text-[#26723a]">{unit.status}</span><span className="text-xs text-[#7a877d]">{unit.town || 'Location not listed'}</span></div><h2 className="mt-4 font-display text-lg font-extrabold">{unit.propertyTitle}</h2><p className="mt-1 text-sm text-[#748077]">{unit.unitType}</p><div className="mt-4 flex items-center justify-between"><b className="font-display text-xl">{money(unit.unitPriceNaira)}</b><Link href={`/property/${unit.parentPropertyId}`} className="text-sm font-bold text-[#26723a]">View property <ArrowRight className="ml-1 inline" size={14}/></Link></div></div></article>)}</div> : <EmptyState icon={HeartHandshake} title="No units in this category" body="Try another unit category or check back when new shared-housing units are listed."/>}</div>;
}
function RequestsHub({ query }: { query: UseQueryResult<ListSpecialRequests200> }) {
  const [tab, setTab] = useState('Current Request');
  const items = query.data?.items || [];
  const current = items.filter(item => !['sourced','closed','rejected','completed'].includes(item.status));
  const history = items.filter(item => ['sourced','closed','rejected','completed'].includes(item.status));
  return <div className="space-y-6"><PageIntro eyebrow="Stay in the loop" title="My requests" text="Review request history, current searches, new requests, and statement requests."/>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Request sections">{['Request History','Current Request','New Request','Statement Request'].map(label=><button key={label} role="tab" aria-selected={tab===label} onClick={()=>setTab(label)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab===label?'bg-[#183b22] text-white':'border border-[#dce5dd] bg-white text-[#435449]'}`}>{label}</button>)}</div>
    {tab==='New Request' ? <div className="rounded-2xl border border-[#e4eae3] bg-white p-6"><p className="text-sm text-[#65756a]">Start a property search request with your preferred location and budget.</p><Link href="/request-property" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0B0F0E] px-4 py-3 text-sm font-bold text-white"><Plus size={16}/>Create a request</Link></div> :
    tab==='Statement Request' ? <div className="rounded-2xl border border-[#e4eae3] bg-white p-6"><h2 className="font-display text-xl font-extrabold">Request an account statement</h2><p className="mt-2 text-sm text-[#718077]">Statement generation is available after your account and payment records are connected. No statement request has been submitted.</p><Link href="/wallet" className="mt-4 inline-flex font-bold text-[#18783a]">View payments and fees <ArrowRight size={14}/></Link></div> :
    query.isLoading ? <div className="grid gap-3"><LoadingCard/><LoadingCard/></div> : query.isError ? <ErrorState onRetry={()=>query.refetch()}/> : (tab==='Request History'?history:current).length ? <div className="space-y-3">{(tab==='Request History'?history:current).map(r=><article key={r.id} className="rounded-2xl border border-[#e4eae3] bg-white p-5 sm:flex sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e8f5e9] px-3 py-1 text-xs font-bold capitalize text-[#26723a]">{r.status}</span><span className="text-xs text-[#748077]">{r.urgency==='urgent'?'Priority request':'Standard request'}</span></div><h2 className="mt-3 font-display text-lg font-extrabold">{r.desiredTown}, {r.desiredState}</h2><p className="mt-1 text-sm text-[#718077]">{r.neighborhood||r.desiredLga} · Budget up to {money(r.budgetNaira)}</p></div><span className="mt-3 text-xs text-[#78847b] sm:mt-0">{r.createdAt?new Date(r.createdAt).toLocaleDateString():'Date not provided'}</span></article>)}</div> : <EmptyState icon={ListChecks} title={tab==='Request History'?'No request history yet':'No current requests'} body="Requests you submit will appear here with their latest status."/>}
  </div>;
}
function MapSearchPage({ properties, loading, failed, apiKey, mapsState, onRetry }: { properties: Property[]; loading: boolean; failed: boolean; apiKey?: string; mapsState:'missing'|'loading'|'ready'|'failed'; onRetry:()=>void }) {
  const [type,setType]=useState('all');
  const [service,setService]=useState('all');
  const types=[['all','All Types'],['home','Home'],['land','Land'],['warehouse','Warehouse'],['complex','Complex'],['shopping_mall','Mall'],['hotel','Hotel'],['school','School'],['hospital','Hospital'],['filling_station','Filling Station'],['worship_center','Worship Centers'],['factory','Factory'],['custom','Custom']];
  const services=[['all','All Services'],['rent','Rent'],['lease','Lease'],['social','Shared'],['sale','Buy'],['mortgage','Mortgage'],['hotel_booking','Hotel Room Booking'],['managed','Property Management'],['represented_tenants','Represented Tenants'],['property_recovery','Property Recovery']];
  const matches=properties.filter(p=>(type==='all'||String(p.category)===type)&&
    (service==='all'||p.intent===service||(service==='hotel_booking'&&p.category==='hotel')||(service==='managed'&&p.isManaged)));
  return <div className="space-y-5"><PageIntro eyebrow="Search by place" title="Explore the map" text="See what’s listed around the places that matter to you."/>
    <div className="grid gap-3 rounded-2xl border border-[#e4eae3] bg-white p-4 sm:grid-cols-2"><label className="block text-sm font-semibold text-[#304039]">Property type<select aria-label="Property type" value={type} onChange={event=>setType(event.target.value)} className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3">{types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="block text-sm font-semibold text-[#304039]">Property service<select aria-label="Property service" value={service} onChange={event=>setService(event.target.value)} className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3">{services.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
     <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><div className="min-h-[430px] overflow-hidden rounded-3xl border border-[#dce5dd] bg-[#e8eee5]"><EstateholdMap googleMapsKey={apiKey} googleMapsState={mapsState} className="min-h-[430px]"/></div><div className="space-y-3">{loading?<LoadingCard/>:failed?<ErrorState onRetry={onRetry}/>:matches.length?matches.slice(0,5).map(p=><PropertyCard key={p.id} property={p}/>):<EmptyState icon={MapPin} title="No listings match these filters" body="Change the property type or service filters to explore other listings."/>}</div></div>
  </div>;
}
function ProcessingFeesPage({ query }: { query: UseQueryResult<ProcessingFeeSchedule> }) {
  const schedule=query.data;
  return <div className="mx-auto max-w-5xl space-y-6"><PageIntro eyebrow="Transparent pricing" title="Processing fees & service charges" text="Published Estatehold processing fees. Property purchase, rent, and financing quotes remain separate from these listing and booking charges."/>
    {query.isLoading?<LoadingCard/>:query.isError?<ErrorState onRetry={()=>query.refetch()}/>:<div className="grid gap-4 md:grid-cols-2"><section className="rounded-3xl border border-[#e4eae3] bg-white p-6"><h2 className="font-display text-xl font-extrabold">Standard property listings</h2><p className="mt-2 text-sm text-[#718077]">{(schedule?.standardCategories||[]).join(', ')}.</p><p className="mt-5 font-display text-3xl font-extrabold">{money(schedule?.standardListingFeeNaira)} <span className="font-sans text-sm font-semibold text-[#718077]">per property</span></p></section>
    <section className="rounded-3xl border border-[#e4eae3] bg-white p-6"><h2 className="font-display text-xl font-extrabold">Institutional listings</h2><p className="mt-2 text-sm text-[#718077]">{(schedule?.institutionalCategories||[]).join(', ')}.</p><p className="mt-5 font-display text-2xl font-extrabold">{money(schedule?.institutionalListingFeeNaira)} <span className="font-sans text-sm font-semibold">listing processing</span></p><p className="mt-2 font-semibold text-[#526a58]">Plus {money(schedule?.institutionalYearlyServiceChargeNaira)} yearly service charge</p></section>
    <section className="rounded-3xl border border-[#e4eae3] bg-white p-6 md:col-span-2"><h2 className="font-display text-xl font-extrabold">Hotel room bookings</h2><p className="mt-2 text-sm text-[#718077]">Hotel listing processing fee: {money(schedule?.hotelListingFeeNaira)}. Total commission: {Number(schedule?.hotelOwnerCommissionPercent||0)+Number(schedule?.guestCommissionPercent||0)}% of each room booking.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#f3f7f2] p-4"><b>{schedule?.hotelOwnerCommissionPercent}% deducted from owner payout</b></div><div className="rounded-xl bg-[#f3f7f2] p-4"><b>{schedule?.guestCommissionPercent}% charged to guest/customer</b></div></div></section></div>}
    <Notice tone="amber">The fee schedule is served by the backend. Paystack collection and settlement remain test-only until configured and verified.</Notice></div>;
}
function OfficesPage({apiKey,mapsState}:{apiKey?:string;mapsState:'missing'|'loading'|'ready'|'failed'}) {
  return <div className="space-y-6"><PageIntro eyebrow="Local support" title="Estatehold Offices Near You" text="Find a corporate Estatehold office and its support hours."/>
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><section className="min-h-[380px] overflow-hidden rounded-3xl border border-[#dce5dd] bg-[#e8eee5]"><EstateholdMap googleMapsKey={apiKey} googleMapsState={mapsState}/></section><div className="rounded-3xl border border-[#e4eae3] bg-white p-6"><h2 className="font-display text-xl font-extrabold">Office locations</h2><div className="mt-4 rounded-2xl bg-[#f4f8f3] p-4"><h3 className="font-bold">Estatehold HQ - Emene</h3><p className="mt-1 text-sm text-[#718077]">Emene, Enugu State</p><p className="mt-1 text-xs text-[#718077]">6.4776, 7.5458</p></div><p className="mt-4 text-sm leading-6 text-[#718077]">Office phone number and support hours have not been provided yet.</p></div></div>
  </div>;
}
function WalletPage({ quote, onQuote, calc, payment, paymentResult, setPayment, onConfirmEscrow, canConfirmEscrow }: { quote: FeeQuote|null; onQuote: (q:FeeQuote|null)=>void; calc: ReturnType<typeof useCalculateFees>; payment: ReturnType<typeof useInitializePayment>; paymentResult: {reference:string;authorizationUrl:string;mode:string}|null; setPayment:(v:{reference:string;authorizationUrl:string;mode:string}|null)=>void; onConfirmEscrow:(transactionId:string)=>Promise<void>; canConfirmEscrow:boolean }) {
  const [escrowConfirming, setEscrowConfirming] = useState(false);
  const [escrowConfirmError, setEscrowConfirmError] = useState('');
  const [escrowConfirmSuccess, setEscrowConfirmSuccess] = useState(false);
  const submitEscrowConfirmation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const transactionId = String(new FormData(form).get('escrowTransactionId') || '').trim();
    setEscrowConfirming(true);
    setEscrowConfirmError('');
    setEscrowConfirmSuccess(false);
    try {
      await onConfirmEscrow(transactionId);
      setEscrowConfirmSuccess(true);
      form.reset();
    } catch (error) {
      setEscrowConfirmError(error instanceof Error ? error.message : 'Buyer confirmation could not be recorded.');
    } finally {
      setEscrowConfirming(false);
    }
  };
  return <div className="mx-auto max-w-5xl space-y-6"><PageIntro eyebrow="Know the numbers first" title="Fees & test checkout" text="Request the fee split from the Estatehold calculator. Checkout here runs in test mode only."/><Notice tone="amber"><b>Test mode only.</b> Escrow stays held until all funds are paid, the buyer confirms completed handover, and an administrator approves compliance.</Notice>
    <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const arrangement=String(fd.get('arrangement'));calc.mutate({data:{transactionType:String(fd.get('transactionType')) as 'sale'|'rent_year_one'|'rent_renewal'|'rent_micro_installment'|'social_housing',amountNaira:Number(fd.get('amountNaira')),isManaged:arrangement==='managed',isDirectLandlord:arrangement==='direct'}},{onSuccess:onQuote});}} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7"><h2 className="font-display text-xl font-extrabold">Estimate a transaction</h2><Field label="Transaction amount (₦)" name="amountNaira" type="number" min={1} required placeholder="e.g. 1800000"/><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Transaction type" name="transactionType" options={[['rent_year_one','First year’s rent'],['rent_renewal','Rent renewal'],['rent_micro_installment','Rent installment'],['sale','Property sale'],['social_housing','Shared housing']]}/><SelectField label="Listing arrangement" name="arrangement" options={[['direct','Direct landlord'],['managed','Managed property']]}/></div>
      {calc.isError && <Notice tone="red">Fee quote could not be calculated. Please try again.</Notice>}<Button type="submit" disabled={calc.isPending}>{calc.isPending?'Calculating…':'Calculate fees'} <ArrowRight size={15}/></Button>
      {quote && <div className="rounded-2xl bg-[#f2f8f2] p-4"><h3 className="font-bold">Quote breakdown</h3><dl className="mt-3 space-y-2 text-sm">{[['Buyer pays',quote.buyerPaysNaira],['Landlord pays',quote.landlordPaysNaira],['Platform fee',quote.platformFeeNaira],['Agent fee',quote.agentFeeNaira],['Landlord receives',quote.landlordReceivesNaira]].map(([k,v])=><div key={String(k)} className="flex justify-between gap-4"><dt className="text-[#65746a]">{String(k)}</dt><dd className="font-bold">{money(Number(v))}</dd></div>)}</dl>{quote.note && <p className="mt-3 text-xs text-[#718077]">{quote.note}</p>}</div>}
    </form>
    <section className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#26723a]"><Wallet size={20}/></div><h2 className="font-display text-xl font-extrabold">Test checkout</h2><p className="text-sm leading-6 text-[#718077]">Initialize a simulated payment from an existing Estatehold transaction.</p><Field label="Transaction ID" name="transactionId" required placeholder="Enter an existing transaction ID"/>
      <Button onClick={()=>{const id=(document.querySelector('[data-testid=\"input-transactionId\"]') as HTMLInputElement)?.value.trim();if(!id)return;payment.mutate({data:{transactionId:id}},{onSuccess:r=>setPayment(r)});}} disabled={payment.isPending}>{payment.isPending?'Starting test checkout…':'Initialize test payment'} <ArrowRight size={15}/></Button>
      {payment.isError && <Notice tone="red">Payment initialization did not complete. Try again.</Notice>}{paymentResult && <div className="rounded-xl border border-[#cce5d0] bg-[#f1faf2] p-4 text-sm"><div className="flex items-center gap-2 font-bold text-[#28663b]"><Check size={16}/>Test payment ready</div><p className="mt-2 text-xs text-[#63746a]">Reference: {paymentResult.reference} · Mode: {paymentResult.mode}</p><a href={paymentResult.authorizationUrl} className="mt-3 inline-block font-bold text-[#16783a] underline">Continue to test authorization</a></div>}
     </section>
     <section className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f2e8] text-[#856c2d]"><LockKeyhole size={20}/></div><h2 className="font-display text-xl font-extrabold">Confirm completed handover</h2><p className="text-sm leading-6 text-[#718077]">Only the buyer can confirm that execution, required documentation, and handover are complete. This confirmation is one of the checks required before an administrator can release escrow.</p><form onSubmit={submitEscrowConfirmation} className="space-y-4"><Field label="Transaction ID" name="escrowTransactionId" required placeholder="Enter the paid transaction ID"/><label className="flex items-start gap-3 text-sm leading-5 text-[#46564a]"><input name="handoverConfirmed" type="checkbox" required className="mt-1 h-4 w-4 accent-[#18783a]"/><span>I confirm the transaction execution, required documentation, and handover are complete.</span></label>{escrowConfirmError&&<Notice tone="red">{escrowConfirmError}</Notice>}{escrowConfirmSuccess&&<Notice>Buyer confirmation recorded. Escrow remains held until an administrator reviews and releases it.</Notice>}<Button type="submit" disabled={!canConfirmEscrow||escrowConfirming}>{escrowConfirming?'Recording confirmation…':'Confirm handover'}</Button>{!canConfirmEscrow&&<p className="text-xs text-[#8c6c39]">Sign in as the buyer to confirm a paid transaction.</p>}</form></section>
     </div></div>;
}
function InstallmentPage({ quote, onQuote, calc, canApplyForLoan }: { quote:InstallmentQuote|null; onQuote:(q:InstallmentQuote|null)=>void; calc:ReturnType<typeof useCalculateInstallments>; canApplyForLoan:boolean }) {
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="Plan what works" title="Installment calculator" text="Check the installment schedule returned by Estatehold before you take the next step."/><div className="grid gap-5 md:grid-cols-[.8fr_1.2fr]"><form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const transactionType=String(fd.get('transactionType')) as 'rent'|'lease'|'shared'|'sale'|'loan';if(transactionType==='loan'&&!canApplyForLoan)return;calc.mutate({data:{amountNaira:Number(fd.get('installmentAmount')),count:Number(fd.get('count')),transactionType}},{onSuccess:onQuote});}} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-6"><SelectField label="Plan type" name="transactionType" options={ [['rent','Rent'],['lease','Lease'],['shared','Shared'],['sale','Sale'],['loan','Loan — represented tenants only']]} disabledOptions={canApplyForLoan?[]:['loan']}/>{!canApplyForLoan&&<Notice>Estatehold loan access is limited to represented tenants. NIN/BVN collection is unavailable until a verification provider is selected.</Notice>}<Field label="Total amount (₦)" name="installmentAmount" type="number" min={1} required placeholder="Enter amount"/><SelectField label="Number of installments" name="count" defaultValue="3" options={ [['2','2 installments'],['3','3 installments'],['4','4 installments']]}/>{calc.isError&&<Notice tone="red">The schedule could not be calculated. Loan quotes require an approved represented-tenant account.</Notice>}<Button type="submit" disabled={calc.isPending}>{calc.isPending?'Calculating…':'Build schedule'}</Button></form>
    {quote?<div className="rounded-3xl border border-[#e4eae3] bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-[#65806a]">Payment schedule</p><h2 className="mt-1 font-display text-2xl font-extrabold">Your installments</h2></div><Calculator className="text-[#3a874d]"/></div><div className="mt-5 space-y-3">{quote.items.map(item=><div key={item.number} className="flex items-center justify-between rounded-xl bg-[#f4f8f3] p-4"><span className="flex items-center gap-3 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-[#23743a]">{item.number}</span>Payment {item.number}</span><b>{money(item.amountNaira)}</b></div>)}</div><div className="mt-4 flex justify-between border-t border-[#e6ece5] pt-4"><span className="font-bold">Total</span><b className="font-display text-xl">{money(quote.totalNaira)}</b></div></div>:<EmptyState icon={Calculator} title="A schedule, not a guess" body="Enter the full amount and choose 2–4 installments to see the calculated schedule."/>}</div></div>;
}
function ProfilePage({ profile, updateProfile, onSubmit, authSession, onLogout, payoutBanks, payoutDestination, savePayoutDestination, onSavePayout }: { profile:UseQueryResult<Profile>; updateProfile:ReturnType<typeof useUpdateProfile>; onSubmit:(d:FormData)=>void; authSession:{access_token:string;user?:{email?:string}}|null;onLogout:()=>void;payoutBanks:UseQueryResult<PayoutBank[]>;payoutDestination:UseQueryResult<PayoutDestination>;savePayoutDestination:ReturnType<typeof useSavePayoutDestination>;onSavePayout:(form:HTMLFormElement)=>void }) {
  const p=profile.data;
  const destination=payoutDestination.data;
  const signedIn=!!authSession;
  const [landlordIndemnitySigned,setLandlordIndemnitySigned]=useState(false);
  useEffect(()=>{
    if(!signedIn||p?.role!=='landlord'){setLandlordIndemnitySigned(false);return;}
    let active=true;
    fetch('/api/landlord-kyc',{headers:{Authorization:`Bearer ${authSession!.access_token}`}})
      .then(async response=>response.ok?response.json():null)
      .then(data=>{if(active)setLandlordIndemnitySigned(data?.indemnitySigned===true);})
      .catch(()=>{if(active)setLandlordIndemnitySigned(false);});
    return()=>{active=false;};
  },[authSession?.access_token,p?.role,signedIn]);
  return <div className="mx-auto max-w-4xl space-y-6"><PageIntro eyebrow="Your Estatehold identity" title="Profile & verification" text="Your location helps personalize discovery. Verification status is shown as returned by Estatehold."/>
    {profile.isLoading?<LoadingCard/>:profile.isError?<ErrorState onRetry={()=>profile.refetch()}/>:<div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]"><section className="h-fit rounded-3xl bg-[#0B0F0E] p-6 text-white"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#183b22] text-xl font-extrabold text-[#89d697]">{p?.fullName?.split(/\s/).map(s=>s[0]).slice(0,2).join('')||'EH'}</div><h2 className="mt-4 font-display text-2xl font-extrabold">{p?.fullName||'Estatehold profile'}</h2><p className="mt-1 text-sm text-[#a9b8aa]">{p?.email||authSession?.user?.email||'Email not available'}</p><div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[.07] p-3 text-sm"><ShieldCheck size={17} className="text-[#8ad697]"/><span className="capitalize">{(p?.verificationStatus||'unverified').replace('_',' ')} verification</span></div><div className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-[#9eaea0]">KYC and legal details are handled in line with Estatehold’s review process.</div>{authSession && <button onClick={onLogout} className="mt-4 text-xs font-bold text-[#9bd6a4]">Sign out</button>}</section>
      <div className="space-y-5">
        <form onSubmit={e=>{e.preventDefault();onSubmit(new FormData(e.currentTarget));}} className="grid gap-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:grid-cols-2 sm:p-7"><Field label="Full name" name="fullName" required defaultValue={p?.fullName}/><Field label="Email address (managed by auth)" name="email" type="email" defaultValue={p?.email || authSession?.user?.email} readOnly/><Field label="Phone" name="phone" defaultValue={p?.phone}/><SelectField label="Account role" name="role" defaultValue={p?.role||'client'} options={[['client','Client'],['landlord','Landlord'],['agent','Agent'],['attorney','Attorney']]}/><Field label="Country" name="country" defaultValue="Nigeria"/><Field label="State" name="state" required defaultValue={p?.state}/><Field label="LGA" name="lga" defaultValue={p?.lga}/><Field label="Town" name="town" required defaultValue={p?.town}/><Field label="Village of origin" name="villageOfOrigin" defaultValue={p?.villageOfOrigin}/><Field label="NBA seal number (attorney)" name="nbaSealNumber" defaultValue={p?.nbaSealNumber}/>{updateProfile.isError&&<div className="sm:col-span-2"><Notice tone="red">Profile update failed. Review required fields and retry.</Notice></div>}<div className="sm:col-span-2"><Button type="submit" disabled={updateProfile.isPending}>{updateProfile.isPending?'Saving profile…':'Save profile'} <Check size={15}/></Button></div></form>
        <section className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7">
          <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#65806a]">Commission payouts</p><h2 className="mt-1 font-display text-xl font-extrabold">Verified bank account</h2><p className="mt-2 text-sm leading-6 text-[#718077]">Paystack verifies your Nigerian account. Estatehold encrypts the account details on the server and only shows a masked account number here.</p></div>
          {signedIn&&p?.role==='landlord'&&!landlordIndemnitySigned&&<Notice tone="amber">Review and sign the landlord indemnity before adding a payout account. <Link href="/landlord-kyc" className="ml-1 font-bold underline">Complete landlord KYC</Link></Notice>}
          {!signedIn ? <Notice>Sign in to add or view a payout account.</Notice> :
            payoutDestination.isLoading ? <LoadingCard/> :
            payoutDestination.isError ? <ErrorState onRetry={()=>payoutDestination.refetch()}/> :
            destination?.configured ? <div className="rounded-2xl border border-[#dce8dc] bg-[#f4f9f3] p-4"><div className="flex items-center gap-2 text-sm font-bold text-[#28663b]"><ShieldCheck size={17}/>Paystack account verified</div><p className="mt-3 font-semibold">{destination.accountName}</p><p className="mt-1 text-sm text-[#68766b]">{destination.bankName} · •••• {destination.accountLast4}</p><p className="mt-3 text-xs text-[#718077]">Entering another verified account below will replace this payout destination.</p></div> :
            <p className="rounded-xl bg-[#f4f8f3] p-4 text-sm text-[#718077]">No payout account has been added.</p>}
          {signedIn && (p?.role!=='landlord'||landlordIndemnitySigned) && <form onSubmit={e=>{e.preventDefault();onSavePayout(e.currentTarget);}} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[#27352a]"><span className="mb-1.5 block">Nigerian bank</span><select name="bankCode" required disabled={payoutBanks.isLoading||payoutBanks.isError} className="min-h-11 w-full rounded-xl border border-[#dfe6df] bg-white px-3 text-sm font-normal outline-none focus:border-[#3a874d]"><option value="">{payoutBanks.isLoading?'Loading banks…':'Choose a bank'}</option>{payoutBanks.data?.map(bank=><option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
            <Field label="10-digit account number" name="accountNumber" type="text" inputMode="numeric" autoComplete="off" maxLength={10} pattern="[0-9]{10}" required placeholder="Enter account number"/>
            {payoutBanks.isError&&<div className="sm:col-span-2"><Notice tone="red">The bank list could not be loaded. <button type="button" onClick={()=>payoutBanks.refetch()} className="font-bold underline">Retry</button></Notice></div>}
            {savePayoutDestination.isError&&<div className="sm:col-span-2"><Notice tone="red">Paystack could not verify this account. Confirm the bank and 10-digit number, then try again.</Notice></div>}
            <p className="text-xs leading-5 text-[#718077] sm:col-span-2">Do not enter BVN or NIN. Your account number is sent to Estatehold’s server for Paystack verification and is not saved in browser storage.</p>
            <div className="sm:col-span-2"><Button type="submit" disabled={payoutBanks.isLoading||payoutBanks.isError||savePayoutDestination.isPending}>{savePayoutDestination.isPending?'Verifying and saving…':destination?.configured?'Verify replacement account':'Verify and save account'} <ShieldCheck size={15}/></Button></div>
          </form>}
        </section>
      </div></div>}</div>;
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
    <Route path="/"><AppContent/></Route><Route path="/browse"><AppContent/></Route><Route path="/hotels"><AppContent/></Route><Route path="/register-agent"><AppContent/></Route><Route path="/agent-dashboard"><AppContent/></Route><Route path="/map"><AppContent/></Route><Route path="/property/:id"><AppContent/></Route>
    <Route path="/list-property"><AppContent/></Route><Route path="/request-property"><AppContent/></Route><Route path="/requests"><AppContent/></Route><Route path="/social-housing"><AppContent/></Route><Route path="/complaints/new"><AppContent/></Route>
    <Route path="/wallet"><AppContent/></Route><Route path="/installment-calculator"><AppContent/></Route><Route path="/profile"><AppContent/></Route><Route path="/poa/landlord"><AppContent/></Route><Route path="/poa/tenant"><AppContent/></Route>
    <Route path="/recovery"><AppContent/></Route><Route path="/tenancy-agreement"><AppContent/></Route><Route path="/processing-fees"><AppContent/></Route><Route path="/offices"><AppContent/></Route><Route path="/landlord-kyc"><AppContent/></Route><Route path="/admin"><AppContent/></Route><Route path="/sign-in"><AppContent/></Route><Route path="/sign-up"><AppContent/></Route><Route component={NotFound}/>
  </Switch></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
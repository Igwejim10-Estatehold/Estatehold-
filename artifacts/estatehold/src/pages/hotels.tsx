import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  getListPropertiesQueryKey,
  useCreateProperty,
  useListProperties,
} from '@workspace/api-client-react';
import type { Property, PropertyInput } from '@workspace/api-client-react';
import {
  ArrowRight, BadgeCheck, Building2, Camera, Check, Clock3, ExternalLink,
  MapPin, Phone, ShieldCheck, Smartphone, X,
} from 'lucide-react';

const PRIVACY_NOTICE = 'Guest privacy respected. No monitoring inside rooms. Safety check-in is voluntary and requires explicit consent.';
const money = (value: number) => `₦${new Intl.NumberFormat('en-NG').format(value)}`;
type Session = { access_token: string; user?: { email?: string } } | null;

function PanelMessage({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm leading-6 ${tone === 'success' ? 'border-[#cce5d0] bg-[#f1faf2] text-[#27643b]' : 'border-[#f0d2cf] bg-[#fff8f6] text-[#853b32]'}`}>{children}</div>;
}

function HotelCard({ property }: { property: Property }) {
  const [optedIn, setOptedIn] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [composerOpened, setComposerOpened] = useState(false);
  const phone = property.emergencyContactPhone;
  const smsHref = phone ? `sms:${phone}?body=${encodeURIComponent(`Hello ${property.title}, I am checking in and would like to share a safety check-in.`)}` : undefined;
  return <article className="overflow-hidden rounded-3xl border border-[#dfe8dc] bg-white shadow-[0_14px_42px_-34px_rgba(22,54,31,.38)]">
    <div className="relative h-52 overflow-hidden bg-[#e8eee5]">
      {property.imageUrl ? <img src={property.imageUrl} alt={property.title} className="h-full w-full object-cover"/> :
        <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_72%_20%,#d2e4d3,transparent_36%),linear-gradient(135deg,#edf3e9,#dce8de)]"><Building2 size={54} strokeWidth={1.1} className="text-[#7e9984]"/></div>}
      <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-[#f7fbf4]/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-[#27643b]"><BadgeCheck size={14}/>Verified stay</span>
      <span className="absolute right-4 top-4 rounded-full bg-[#16291c]/90 px-3 py-1.5 text-[11px] font-bold text-white">{property.category === 'hotel' ? 'Hotel' : 'Short-let'}</span>
    </div>
    <div className="p-5 sm:p-6">
      <h2 className="font-display text-xl font-extrabold leading-snug">{property.title}</h2>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-[#718077]"><MapPin size={14}/>{property.town}, {property.state}</p>
      <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#607066]">{property.description || 'Contact the property directly to confirm current accommodation details and terms.'}</p>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-[#edf1ec] py-4 text-xs font-semibold text-[#4f6254]">
        {property.hotelHas24HourReception && <span className="inline-flex items-center gap-1.5"><Clock3 size={14} className="text-[#397a4a]"/>24-hour reception</span>}
        {property.hotelCctvDisclosed && <span className="inline-flex items-center gap-1.5"><Camera size={14} className="text-[#397a4a]"/>CCTV in common areas only</span>}
        {property.hotelSafetyCheckinAvailable && <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#397a4a]"/>Optional safety check-in</span>}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <p className="font-display text-xl font-extrabold">{money(property.priceNaira)}<span className="ml-1 font-sans text-xs font-medium text-[#77847a]">{property.priceUnit || 'per stay'}</span></p>
        {phone && <a href={`tel:${phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce5dd] px-3.5 text-xs font-bold text-[#294c32] hover:bg-[#f3f8f1]"><Phone size={14}/>Call contact</a>}
      </div>
      <p className="mt-4 rounded-xl bg-[#f4f7f2] p-3 text-xs leading-5 text-[#5e7062]">Camera disclosure: CCTV, where stated, is limited to common areas. Inside-room monitoring is not permitted.</p>
      {property.hotelSafetyCheckinAvailable && phone && <div className="mt-4 rounded-2xl border border-[#dce9dd] bg-[#f8fbf6] p-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-[#435649]">
          <input type="checkbox" checked={optedIn} onChange={e => { setOptedIn(e.target.checked); setComposerOpened(false); }} className="mt-0.5 h-4 w-4 accent-[#28763d]"/>
          <span>I want to opt in to a voluntary safety check-in message to this property contact.</span>
        </label>
        {!showConsent ? <button type="button" disabled={!optedIn} onClick={() => setShowConsent(true)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#173b24] px-3.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Smartphone size={14}/>Review consent before SMS</button> :
          <div className="mt-3 rounded-xl border border-[#dfe8dc] bg-white p-3">
            <p className="text-xs leading-5 text-[#526457]">Your device will open its SMS composer addressed to the public hotel contact. Estatehold will not send the message, collect guest details, or store your location.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={optedIn ? smsHref : undefined} onClick={e => { if (!optedIn) { e.preventDefault(); return; } setComposerOpened(true); }} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-bold ${optedIn ? 'bg-[#173b24] text-white' : 'pointer-events-none bg-[#e8ece7] text-[#879187]'}`}><ExternalLink size={14}/>Open SMS composer</a>
              <button type="button" onClick={() => setShowConsent(false)} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold text-[#627067]">Cancel</button>
            </div>
            {composerOpened && <p role="status" className="mt-2 text-xs text-[#39734a]">SMS composer opened. Review the message on your device before sending.</p>}
          </div>}
      </div>}
      <p className="mt-4 text-[11px] leading-5 text-[#819086]">Estatehold displays verification status and listing details; confirm availability and terms directly before booking.</p>
    </div>
  </article>;
}

export default function HotelsPage({ authSession }: { authSession: Session }) {
  const queryClient = useQueryClient();
  const listings = useListProperties(undefined, { query: { queryKey: getListPropertiesQueryKey() } });
  const createProperty = useCreateProperty();
  const visible = (listings.data?.items || []).filter(p =>
    (p.category === 'hotel' || p.category === 'short_let') &&
    p.hotelVerificationStatus === 'verified' && p.pinStatus === 'verified',
  );
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const input: PropertyInput = {
      title: String(fd.get('title')).trim(),
      category: String(fd.get('category')) as PropertyInput['category'],
      state: String(fd.get('state')).trim(),
      town: String(fd.get('town')).trim(),
      address: String(fd.get('address') || '').trim() || undefined,
      description: String(fd.get('description') || '').trim() || undefined,
      priceNaira: Number(fd.get('priceNaira')),
      priceUnit: String(fd.get('priceUnit') || '').trim() || undefined,
      intent: 'rent',
      latitude: Number(fd.get('latitude')) || 0,
      longitude: Number(fd.get('longitude')) || 0,
      imageUrl: String(fd.get('imageUrl') || '').trim() || undefined,
      premisesRulesUrl: String(fd.get('premisesRulesUrl')).trim(),
      hotelCacNumber: String(fd.get('hotelCacNumber')).trim(),
      emergencyContactPhone: String(fd.get('emergencyContactPhone')).trim(),
      hotelHas24HourReception: fd.get('hotelHas24HourReception') === 'on',
      hotelCctvCommonAreas: fd.get('hotelCctvCommonAreas') === 'on',
      hotelCctvDisclosed: fd.get('hotelCctvDisclosed') === 'on',
      hotelSafetyCheckinAvailable: fd.get('hotelSafetyCheckinAvailable') === 'on',
    };
    createProperty.mutate({ data: input }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        form.reset();
      },
    });
  };

  return <div className="space-y-8">
    <section className="relative overflow-hidden rounded-[28px] bg-[#15281b] px-6 py-8 text-[#f5f6f1] sm:px-10 sm:py-10">
      <div className="absolute -right-10 -top-24 h-80 w-80 rounded-full border border-[#729078]/30"/><div className="absolute -right-2 top-[-30px] h-64 w-64 rounded-full border border-[#729078]/20"/>
      <div className="relative max-w-3xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-[#c2d8c3]"><ShieldCheck size={14}/>Careful stays, clearly reviewed</span>
        <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-[-.04em] sm:text-5xl">A stay you can<br/><span className="text-[#9ccea0]">check before you choose.</span></h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#cfdbd0]">Browse hotels and short-lets with verified property review and a verified location pin. The directory shows only listings that have passed both checks.</p>
      </div>
    </section>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#65806a]">Public directory</p><h2 className="mt-1 font-display text-2xl font-extrabold">Hotels & short-lets</h2></div><span className="rounded-full bg-[#e8f5e9] px-3 py-1.5 text-xs font-bold text-[#27643b]">{visible.length} verified {visible.length === 1 ? 'stay' : 'stays'}</span></div>
      {listings.isLoading ? <div className="grid gap-4 lg:grid-cols-2">{[0,1].map(i=><div key={i} className="animate-pulse overflow-hidden rounded-3xl border border-[#e4eae3] bg-white"><div className="h-52 bg-[#e9eee8]"/><div className="space-y-3 p-5"><div className="h-5 w-1/2 rounded bg-[#edf2ed]"/><div className="h-4 w-1/3 rounded bg-[#edf2ed]"/><div className="h-16 rounded bg-[#edf2ed]"/></div></div>)}</div> :
        listings.isError ? <div role="alert" className="rounded-2xl border border-[#f0d2cf] bg-[#fff8f6] p-6 text-[#853b32]"><b>We could not load the hotel directory.</b><p className="mt-1 text-sm">Try again when your connection is available.</p><button onClick={() => listings.refetch()} className="mt-3 text-sm font-bold underline">Retry</button></div> :
          visible.length ? <div className="grid gap-4 lg:grid-cols-2">{visible.map(property=><HotelCard key={property.id} property={property}/>)}</div> :
            <div className="rounded-3xl border border-dashed border-[#cbd8cb] bg-[#fbfcf9] px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f5e9] text-[#16843d]"><Building2 size={22}/></div><h3 className="mt-4 font-display text-xl font-extrabold">No verified stays to show yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6a786e]">There are no hotel or short-let listings with both a verified accommodation review and a verified location pin right now. Pending and rejected submissions are not shown here.</p></div>}
    </section>

    <section id="submit-listing" className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
      <div className="h-fit rounded-3xl bg-[#e8f1e6] p-6 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#4c7654]">For property owners</p><h2 className="mt-2 font-display text-2xl font-extrabold">Submit a stay for review</h2><p className="mt-3 text-sm leading-6 text-[#586d5d]">Accommodation listings remain pending until an admin reviews the submission. Only listings approved for review and with a verified location pin appear in the public directory.</p>
        <div className="mt-5 space-y-3 text-sm leading-5 text-[#4e6253]"><p className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#28763d]"/>Hotel or short-let type, rented as accommodation</p><p className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#28763d]"/>Guest terms URL, CAC number and public emergency contact</p><p className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#28763d]"/>Clear camera disclosure and no monitoring inside rooms</p></div>
        <p className="mt-6 rounded-2xl border border-[#c9dbc9] bg-white/70 p-4 text-xs leading-5 text-[#536858]">CAC details are used for review and are never shown in the public directory.</p>
      </div>
      {!authSession ? <div className="flex flex-col justify-center rounded-3xl border border-[#e4eae3] bg-white p-6 sm:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f5e9] text-[#26723a]"><ShieldCheck size={20}/></div><h3 className="mt-4 font-display text-xl font-extrabold">Sign in to submit an owner listing</h3><p className="mt-2 max-w-md text-sm leading-6 text-[#718077]">Your submission will include private business-registration information for administrator review. Sign in to continue securely.</p><Link href="/sign-in" className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[#173b24] px-4 text-sm font-bold text-white">Sign in <ArrowRight size={15}/></Link></div> :
        <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[#304039] sm:col-span-2">Listing title<input name="title" minLength={3} maxLength={120} required placeholder="Name guests will recognize" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">Property type<select name="category" defaultValue="hotel" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"><option value="hotel">Hotel</option><option value="short_let">Short-let</option></select></label>
            <label className="block text-sm font-semibold text-[#304039]">Price (₦)<input name="priceNaira" type="number" min="1" required placeholder="Amount per stay" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">Price unit<input name="priceUnit" placeholder="per night, per week" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">State<input name="state" required placeholder="State" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">Town / city<input name="town" required placeholder="Town or city" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039] sm:col-span-2">Street address<input name="address" placeholder="Address (optional)" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039] sm:col-span-2">Description<textarea name="description" rows={3} placeholder="Describe the accommodation and guest experience" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039] sm:col-span-2">Guest terms / premises rules URL<input name="premisesRulesUrl" type="url" required placeholder="https://…" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">CAC registration number<input name="hotelCacNumber" required placeholder="Private; sent for review" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/><span className="mt-1 block text-xs font-normal text-[#7b887e]">Private to the review process.</span></label>
            <label className="block text-sm font-semibold text-[#304039]">Emergency / reception phone<input name="emergencyContactPhone" type="tel" required placeholder="+234…" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">Listing image URL<input name="imageUrl" type="url" placeholder="https://… (optional)" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">Latitude<input name="latitude" type="number" step="any" placeholder="0 if not known" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
            <label className="block text-sm font-semibold text-[#304039]">Longitude<input name="longitude" type="number" step="any" placeholder="0 if not known" className="mt-2 block w-full rounded-xl border border-[#dfe6df] bg-white px-3.5 py-3 font-normal outline-none focus:border-[#16A34A]"/></label>
          </div>
          <div className="grid gap-3 rounded-2xl bg-[#f5f8f3] p-4 sm:grid-cols-2">
            {[
              ['hotelHas24HourReception','24-hour reception available'],
              ['hotelCctvCommonAreas','CCTV used in common areas'],
              ['hotelCctvDisclosed','CCTV use is disclosed to guests'],
              ['hotelSafetyCheckinAvailable','Offer voluntary safety check-in'],
            ].map(([name,label])=><label key={name} className="flex items-start gap-2.5 text-sm leading-5 text-[#4c5f50]"><input name={name} type="checkbox" className="mt-0.5 h-4 w-4 accent-[#28763d]"/>{label}</label>)}
          </div>
          <div className="rounded-2xl border border-[#eadcb8] bg-[#fff9e9] p-4 text-sm leading-6 text-[#755d21]"><p className="font-bold">Camera and guest privacy acknowledgement</p><p className="mt-1">Any CCTV is limited to disclosed common areas. Monitoring inside guest rooms is prohibited.</p><label className="mt-3 flex items-start gap-2.5 font-semibold"><input name="privacyAcknowledged" type="checkbox" required className="mt-1 h-4 w-4 accent-[#28763d]"/>I confirm the camera disclosure above and acknowledge no inside-room monitoring.</label></div>
          {createProperty.isError && <PanelMessage tone="error">Submission failed. Please check the details and retry. {createProperty.error instanceof Error ? createProperty.error.message : ''}</PanelMessage>}
          {createProperty.isSuccess && <PanelMessage tone="success">Submission received. Your listing remains pending until an administrator reviews it. It is not visible in the public directory yet.</PanelMessage>}
          <button type="submit" disabled={createProperty.isPending} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#0B0F0E] px-5 text-sm font-bold text-white transition hover:bg-[#1a2921] disabled:cursor-not-allowed disabled:opacity-60">{createProperty.isPending ? 'Submitting for review…' : 'Submit for review'} <ArrowRight size={16}/></button>
          <p className="text-xs leading-5 text-[#879187]">Submission creates a pending accommodation listing. Public display requires admin verification and a verified location pin.</p>
        </form>}
    </section>
  </div>;
}

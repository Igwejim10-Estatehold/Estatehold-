import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import type { Profile } from '@workspace/api-client-react';
import LANDLORD_INDEMNITY from '../../../../LANDLORD_INDEMNITY.md?raw';

type Session = { access_token: string; user?: { id?: string } } | null;
type PublicConfig = { supabaseUrl: string; supabaseAnonKey: string } | undefined;

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export default function LandlordKycPage({
  authSession,
  profile,
  config,
}: {
  authSession: Session;
  profile?: Profile;
  config: PublicConfig;
}) {
  const [ninNumber, setNinNumber] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [affidavitState, setAffidavitState] = useState('');
  const [registryLocation, setRegistryLocation] = useState('');
  const [agree, setAgree] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const offline = !config?.supabaseUrl;
  const digitalText = useMemo(() => LANDLORD_INDEMNITY.split('\n---\n')[0]
    .replace('[FULL NAME]', profile?.fullName || '[FULL NAME]')
    .replace('[NIN NUMBER]', ninNumber || '[NIN NUMBER]')
    .replace('[PHONE]', profile?.phone || '[PHONE]')
    .replace('[PROPERTY ADDRESS, LGA, STATE]', propertyAddress || '[PROPERTY ADDRESS, LGA, STATE]'), [ninNumber, propertyAddress, profile?.fullName, profile?.phone]);
  const affidavitText = LANDLORD_INDEMNITY.split('\n---\n')[1]
    ?.replaceAll('[STATE OR FEDERAL CAPITAL TERRITORY]', affidavitState || '[STATE OR FEDERAL CAPITAL TERRITORY]')
    .replaceAll('[REGISTRY LOCATION]', registryLocation || '[REGISTRY LOCATION]') || '';

  useEffect(() => {
    if (!authSession || offline) return;
    let active = true;
    setLoading(true);
    fetch('/api/landlord-kyc', { headers: { Authorization: `Bearer ${authSession.access_token}` } })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || 'Landlord KYC status could not be loaded.');
        if (active) setStatus(payload);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'KYC status could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authSession?.access_token, offline]);

  const printAffidavit = () => {
    if (!affidavitState || !registryLocation.trim()) {
      setError('Choose the state or FCT and the High Court registry location before printing.');
      return;
    }
    setError('');
    const printable = affidavitText.replaceAll('**', '').replace(/^#\s*/gm, '');
    const win = window.open('', '_blank');
    if (!win) { setError('Allow pop-ups to print or save the affidavit as PDF.'); return; }
    win.opener = null;
    win.document.write(`<html><head><title>Estatehold affidavit of ownership</title><style>body{font:14px/1.7 Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#111}pre{white-space:pre-wrap;font:inherit}@media print{button{display:none}}</style></head><body><pre>${escapeHtml(printable)}</pre><button onclick="window.print()">Print / Save as PDF</button></body></html>`);
    win.document.close();
  };

  const uploadPrivateFile = async (file: File, userId: string) => {
    if (!authSession || !config?.supabaseUrl || !config.supabaseAnonKey) throw new Error('Private document storage is unavailable.');
    if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      throw new Error('Use a PDF, JPG or PNG file under 10 MB.');
    }
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
    const url = `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/estatehold-kyc/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${authSession.access_token}`, 'Content-Type': file.type, 'x-upsert': 'false' },
      body: file,
    });
    if (!response.ok) throw new Error('A private KYC document upload failed. Check storage setup and retry.');
    return path;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError('');
    if (!authSession || !profile?.id || !config?.supabaseUrl || !config.supabaseAnonKey) {
      setError('Sign in after the live Supabase connection is restored to submit KYC securely.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const propertyFile = form.get('propertyDocument');
    const affidavitFile = form.get('affidavitPhoto');
    if (!(propertyFile instanceof File) || !propertyFile.size || !(affidavitFile instanceof File) || !affidavitFile.size) {
      setError('Upload both the property ownership document and sworn affidavit.');
      return;
    }
    if (!agree) { setError('Read and accept the complete digital indemnity before submitting.'); return; }
    setSaving(true);
    try {
      const [propertyDocUrl, affidavitUrl] = await Promise.all([
        uploadPrivateFile(propertyFile, profile.id),
        uploadPrivateFile(affidavitFile, profile.id),
      ]);
      const response = await fetch('/api/landlord-kyc', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authSession.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ninNumber,
          ninName: profile.fullName,
          propertyAddress,
          propertyDocUrl,
          affidavitUrl,
          indemnitySigned: true,
          indemnityTextVersion: '2026-10-14-v1',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'KYC submission failed.');
      setStatus(payload);
      setNinNumber('');
      setAgree(false);
      formElement.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'KYC submission failed.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-3xl space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-[#65806a]">Landlord verification</p><h1 className="mt-2 font-display text-3xl font-extrabold">Ownership KYC & indemnity</h1><p className="mt-2 text-sm leading-6 text-[#718077]">NIN is encrypted on the server. The full NIN is never saved in browser storage or shown to administrators.</p></header>
    {offline && <div className="rounded-2xl border border-[#ebd9af] bg-[#fff9e9] p-4 text-sm leading-6 text-[#755d21]"><b>DEMO SAMPLE · NOT LIVE</b><br/>Supabase is unavailable. Do not enter real NIN or upload real identity/property documents in this preview. No KYC is being saved. The form activates after sign-in and the live connection return.</div>}
    {!offline && !authSession && <div className="rounded-2xl border border-[#ebd9af] bg-[#fff9e9] p-4 text-sm">Sign in with a landlord account to continue. <Link href="/sign-in" className="font-bold underline">Sign in</Link></div>}
    {loading && <p className="text-sm text-[#718077]">Loading your KYC status…</p>}
    {status?.submitted === true && <div className="rounded-2xl border border-[#cae7d0] bg-[#f1faf2] p-4 text-sm"><b>Application {String(status.reviewStatus || 'pending')}</b><p className="mt-1">NIN {String(status.maskedNin || '*******')} · {status.ninVerified ? 'verified' : 'verification pending'} · Indemnity {status.indemnitySigned ? 'signed' : 'not signed'}</p></div>}
    {error && <div role="alert" className="rounded-xl border border-[#f0d2cf] bg-[#fff8f6] p-3 text-sm text-[#853b32]">{error}</div>}
    <details className="rounded-2xl border border-[#e4eae3] bg-white p-4"><summary className="cursor-pointer font-bold">Document 1 · Digital indemnity agreement</summary><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[#4d5c51]">{digitalText}</pre><label className="mt-4 flex items-start gap-3 border-t border-[#edf1ec] pt-4 text-sm leading-6"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} disabled={offline||!authSession} className="mt-1 accent-[#16A34A]"/>I have read and agree to this complete digital indemnity.</label></details>
    <section className="grid gap-3 rounded-2xl border border-[#e4eae3] bg-white p-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">State or Federal Capital Territory
        <select value={affidavitState} onChange={e=>setAffidavitState(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dfe6df] bg-white px-3">
          <option value="">Choose state / FCT</option>
          {['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara','Federal Capital Territory'].map(state=><option key={state} value={state}>{state}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">High Court registry / town
        <input value={registryLocation} onChange={e=>setRegistryLocation(e.target.value)} maxLength={120} placeholder="Enter the registry location" className="mt-2 h-11 w-full rounded-xl border border-[#dfe6df] px-3"/>
      </label>
    </section>
    <button type="button" onClick={printAffidavit} className="rounded-xl border border-[#dfe6df] px-4 py-2.5 text-sm font-bold text-[#284a30]">Print / save Document 2 as PDF</button>
    {!offline && authSession && <form onSubmit={submit} className="space-y-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:p-7">
      <h2 className="font-display text-xl font-extrabold">Submit landlord KYC</h2>
      <label className="block text-sm font-semibold">NIN (11 digits)<input value={ninNumber} onChange={e=>setNinNumber(e.target.value.replace(/\D/g,'').slice(0,11))} inputMode="numeric" autoComplete="off" required pattern="[0-9]{11}" className="mt-2 h-11 w-full rounded-xl border border-[#dfe6df] px-3 outline-none focus:border-[#2c8241]"/></label>
      <label className="block text-sm font-semibold">Property address, LGA and state<input value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)} required minLength={5} maxLength={500} className="mt-2 h-11 w-full rounded-xl border border-[#dfe6df] px-3 outline-none focus:border-[#2c8241]"/></label>
      <label className="block text-sm font-semibold">Property ownership document (PDF/JPG/PNG, max 10 MB)<input type="file" name="propertyDocument" accept=".pdf,.jpg,.jpeg,.png" required className="mt-2 block w-full text-sm"/></label>
      <label className="block text-sm font-semibold">Sworn affidavit photo (PDF/JPG/PNG, max 10 MB)<input type="file" name="affidavitPhoto" accept=".pdf,.jpg,.jpeg,.png" required className="mt-2 block w-full text-sm"/></label>
      <button disabled={saving||!agree||ninNumber.length!==11} className="rounded-xl bg-[#0B0F0E] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?'Submitting…':'Sign indemnity & submit KYC'}</button>
    </form>}
  </div>;
}

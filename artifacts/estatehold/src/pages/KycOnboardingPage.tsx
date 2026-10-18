import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, FileLock2, FileText, Landmark, LockKeyhole, ShieldCheck, UploadCloud } from "lucide-react";

type Props = {
  accessToken?: string;
  userId?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  kind: "landlord" | "tenant";
};
type Bank = { name: string; code: string };
type FileNameMap = Record<string, string>;
const common = [
  ["fullLegalName", "Full legal name", "As shown on your NIN", true],
  ["permanentHouseAddress", "Permanent house address", "House number, street and area", true],
  ["city", "City", "e.g. Ikeja", true],
  ["state", "State", "Select or enter state", true],
  ["lga", "Local government area", "Enter your LGA", true],
  ["phoneNumber", "Phone number", "+234", true],
  ["whatsappNumber", "WhatsApp number", "+234", true],
] as const;
const tenantDetails = [
  ["employerName", "Employer name", "Optional", false],
  ["employerAddress", "Work address", "Optional", false],
  ["nextOfKinName", "Next of kin name", "Full name", true],
  ["nextOfKinPhone", "Next of kin phone", "+234", true],
  ["nextOfKinAddress", "Next of kin address", "Residential address", true],
  ["guarantorName", "Guarantor name", "Full name", true],
  ["guarantorPhone", "Guarantor phone", "+234", true],
  ["guarantorAddress", "Guarantor address", "Residential address", true],
] as const;

function Field({ name, label, hint, required = true, type = "text", inputMode, pattern, maxLength }: {
  name: string; label: string; hint?: string; required?: boolean; type?: string; inputMode?: "numeric" | "tel"; pattern?: string; maxLength?: number;
}) {
  return <label className="block text-sm font-semibold text-[#31473a]" htmlFor={`kyc-${name}`}>
    <span>{label}</span>{required && <span className="ml-1 text-[#a14b3f]" aria-hidden="true">*</span>}
    <input id={`kyc-${name}`} data-testid={`input-${name}`} className="estate-input mt-2 text-[15px] font-normal" name={name} type={type} required={required} placeholder={hint} inputMode={inputMode} pattern={pattern} maxLength={maxLength} autoComplete={name === "fullLegalName" ? "name" : undefined}/>
  </label>;
}

function UploadField({ name, title, detail, accept, required = true, selectedName, onChange }: {
  name: string; title: string; detail: string; accept: string; required?: boolean; selectedName?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return <label className="group block cursor-pointer rounded-2xl border border-dashed border-[#bdcdbd] bg-[#fbfcf8] p-4 transition hover:border-[#548066] hover:bg-[#f5f8f1]" htmlFor={`kyc-${name}`}>
    <span className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9efe5] text-[#315d42]"><UploadCloud size={19}/></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[#30483a]">{title}{required && <span className="ml-1 text-[#a14b3f]" aria-hidden="true">*</span>}</span>
        <span className="mt-1 block text-xs leading-5 text-[#78857b]">{detail}</span>
        {selectedName && <span className="mt-2 flex items-center gap-1.5 truncate text-xs font-semibold text-[#28613f]"><Check size={14}/>{selectedName}</span>}
      </span>
      {selectedName && <Check className="mt-1 shrink-0 text-[#28613f]" size={18}/>}
    </span>
    <input id={`kyc-${name}`} data-testid={`input-${name}`} className="sr-only" name={name} type="file" accept={accept} required={required} onChange={onChange}/>
  </label>;
}

export default function KycOnboardingPage({ accessToken, userId, supabaseUrl, supabaseAnonKey, kind }: Props) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [bankError, setBankError] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [files, setFiles] = useState<FileNameMap>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!accessToken || kind !== "landlord") return;
    let active = true;
    setBanksLoading(true);
    fetch("/api/account/payout-banks", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message || "Nigerian bank list is unavailable."); return data as Bank[]; })
      .then(data => { if (active) { setBanks(data); setBankError(""); } })
      .catch(reason => { if (active) setBankError(reason instanceof Error ? reason.message : "Nigerian bank list is unavailable."); })
      .finally(() => { if (active) setBanksLoading(false); });
    return () => { active = false; };
  }, [accessToken, kind]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      setError(`${input.labels?.[0]?.innerText.split("*")[0].trim() || "Document"}: use a PDF, JPG, or PNG file under 10 MB.`);
      input.value = "";
      return;
    }
    setError("");
    setFiles(old => ({ ...old, [input.name]: file.name }));
  }
  async function upload(file: File, label: string) {
    if (!accessToken || !userId || !supabaseUrl || !supabaseAnonKey) throw new Error("Sign in to upload private KYC documents.");
    if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error(`${label}: use a PDF, JPG, or PNG file under 10 MB.`);
    const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}`;
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/estatehold-kyc/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST", headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": file.type, "x-upsert": "false" }, body: file,
    });
    if (!response.ok) throw new Error(`${label} could not be uploaded to private storage.`);
    return path;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const formElement = event.currentTarget;
    if (!accessToken || !userId) { setError("Sign in before submitting KYC."); return; }
    if (kind === "landlord" && !bankCode) { setError("Choose the bank that receives your rental payouts."); return; }
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const body: Record<string, unknown> = Object.fromEntries([...form.entries()].filter(([key, value]) => !(value instanceof File)));
      if (kind === "landlord") {
        for (const [field, label] of [["meansOfId","Means of ID"],["propertyDocuments","Property documents"],["passportPhoto","Passport photo"]] as const) {
          const file = form.get(field); if (!(file instanceof File) || !file.size) throw new Error(`${label} is required.`);
          body[field === "meansOfId" ? "meansOfIdUrl" : field === "propertyDocuments" ? "propertyDocumentsUrl" : "passportPhotoUrl"] = await upload(file, label);
        }
        body.bankCode = bankCode;
      } else {
        const file = form.get("ninDocument"); if (!(file instanceof File) || !file.size) throw new Error("NIN slip or ID card is required.");
        body.ninDocumentUrl = await upload(file, "NIN document");
      }
      const endpoint = kind === "landlord" ? "/api/account/landlord-application" : "/api/account/tenant-application";
      const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Application could not be saved.");
      setNotice("Application received. Our verification team will review your details."); formElement.reset(); setBankCode(""); setFiles({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Application could not be submitted."); }
    finally { setBusy(false); }
  }
  const isLandlord = kind === "landlord";
  return <main className="page-enter mx-auto max-w-6xl px-4 pb-12 pt-7 sm:px-6 sm:pt-12">
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
      <div className="min-w-0">
        <header className="mb-7">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.19em] text-[#557662]"><span className="h-px w-7 bg-[#b18a4c]"/>{isLandlord ? "Landlord verification" : "Tenant application"}</p>
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(2rem,5vw,3.2rem)] font-extrabold leading-[1.08] tracking-[-.045em] text-[#1e382a]">{isLandlord ? "Set up your property account." : "A considered first step to your next home."}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#66766b] sm:text-base">{isLandlord ? "Share your identity, payout details and property evidence to begin verification." : "Provide the details our team needs to verify your application and protect your tenancy."}</p>
        </header>
        {!accessToken && <div role="alert" className="mb-5 flex gap-3 rounded-2xl border border-[#e3c994] bg-[#fff9e9] p-4 text-sm text-[#725b30]"><LockKeyhole size={18} className="mt-0.5 shrink-0"/><span>Sign in to save your application and upload private documents.</span></div>}
        {bankError && isLandlord && <div role="alert" className="mb-5 rounded-2xl border border-[#ead0c8] bg-[#fff7f3] p-4 text-sm text-[#8a4438]">{bankError} You can retry by reloading this page.</div>}
        <form onSubmit={event => void submit(event)} className="space-y-5">
          <section className="rounded-[24px] border border-[#e0e5d9] bg-[#fffefa] p-5 shadow-[0_12px_36px_rgba(38,62,43,.045)] sm:p-8">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9efe5] text-[#315d42]"><ShieldCheck size={18}/></span>
              <div><h2 className="font-display text-lg font-extrabold text-[#264232]">Identity and contact</h2><p className="mt-1 text-xs leading-5 text-[#78857b]">Use the same legal details shown on your identity documents.</p></div>
            </div>
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
              {common.map(([name, label, hint]) => <Field key={name} name={name} label={label} hint={hint} type={name.toLowerCase().includes("phone") ? "tel" : "text"} inputMode={name.toLowerCase().includes("phone") ? "tel" : undefined}/>)}
              {isLandlord ? <>
                <label className="block text-sm font-semibold text-[#31473a]" htmlFor="kyc-bankCode">Bank name<span className="ml-1 text-[#a14b3f]" aria-hidden="true">*</span>
                  <select id="kyc-bankCode" data-testid="select-payout-bank" className="estate-input mt-2 font-normal" required value={bankCode} onChange={event => setBankCode(event.target.value)} disabled={banksLoading || !banks.length}>
                    <option value="">{banksLoading ? "Loading Nigerian banks…" : "Choose payout bank"}</option>{banks.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                  </select>
                </label>
                <Field name="accountNumber" label="Account number" hint="10 digits" inputMode="numeric" pattern="[0-9]{10}" maxLength={10}/>
                <Field name="ninNumber" label="National Identification Number" hint="11 digits" inputMode="numeric" pattern="[0-9]{11}" maxLength={11}/>
              </> : <>
                {tenantDetails.map(([name, label, hint, required]) => <Field key={name} name={name} label={label} hint={hint} required={required} type={name.toLowerCase().includes("phone") ? "tel" : "text"}/>)}
                <Field name="ninNumber" label="National Identification Number" hint="11 digits" inputMode="numeric" pattern="[0-9]{11}" maxLength={11}/>
              </>}
            </div>
          </section>

          {isLandlord && <section className="rounded-[24px] border border-[#e0e5d9] bg-[#fffefa] p-5 shadow-[0_12px_36px_rgba(38,62,43,.045)] sm:p-8">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f3ead9] text-[#8b6a35]"><Landmark size={18}/></span>
              <div><h2 className="font-display text-lg font-extrabold text-[#264232]">Payout details</h2><p className="mt-1 text-xs leading-5 text-[#78857b]">Paystack checks the account name when you submit. Approval remains with Estatehold.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl bg-[#f5f6ef] p-4 text-sm text-[#596c5d] sm:col-span-2"><Landmark size={18} className="shrink-0 text-[#57775f]"/><span>Only Nigerian bank accounts with 10-digit account numbers are supported.</span></div>
            </div>
          </section>}

          <section className="rounded-[24px] border border-[#e0e5d9] bg-[#fffefa] p-5 shadow-[0_12px_36px_rgba(38,62,43,.045)] sm:p-8">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9efe5] text-[#315d42]"><FileText size={18}/></span>
              <div><h2 className="font-display text-lg font-extrabold text-[#264232]">Private documents</h2><p className="mt-1 text-xs leading-5 text-[#78857b]">PDF, JPG or PNG · each file up to 10 MB. Stored privately for authorized review.</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {isLandlord ? <>
                <UploadField name="meansOfId" title="Means of ID" detail="NIN slip or ID card" accept=".pdf,.jpg,.jpeg,.png" selectedName={files.meansOfId} onChange={onFileChange}/>
                <UploadField name="propertyDocuments" title="Property documents" detail="C of O, deed or survey" accept=".pdf,.jpg,.jpeg,.png" selectedName={files.propertyDocuments} onChange={onFileChange}/>
                <div className="sm:col-span-2"><UploadField name="passportPhoto" title="Passport photo" detail="A clear recent portrait image" accept=".jpg,.jpeg,.png" selectedName={files.passportPhoto} onChange={onFileChange}/></div>
              </> : <div className="sm:col-span-2"><UploadField name="ninDocument" title="NIN slip or identity card" detail="Upload a legible NIN slip or government ID" accept=".pdf,.jpg,.jpeg,.png" selectedName={files.ninDocument} onChange={onFileChange}/></div>}
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#78857b]"><FileLock2 size={15} className="mt-0.5 shrink-0 text-[#557662]"/>Your NIN number is encrypted before storage. Identity files are not publicly accessible.</p>
          </section>
          {error && <p role="alert" className="rounded-xl border border-[#edcfc9] bg-[#fff6f3] p-4 text-sm text-[#8b4439]">{error}</p>}
          {notice && <div role="status" className="flex items-start gap-3 rounded-xl border border-[#c9dfcb] bg-[#f2f8ef] p-4 text-sm text-[#315d42]"><Check size={18} className="mt-0.5 shrink-0"/><span>{notice}</span></div>}
          <button data-testid="button-submit-kyc" disabled={busy || !accessToken} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#244b35] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(30,65,43,.15)] transition hover:bg-[#1c3e2b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#326d50]/25 disabled:cursor-not-allowed disabled:opacity-55">
            {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>Uploading securely…</> : <><ShieldCheck size={17}/>Submit for verification</>}
          </button>
          <p className="text-center text-[11px] leading-5 text-[#849087]">By submitting, you confirm these details are accurate and belong to you.</p>
        </form>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-8 overflow-hidden rounded-[26px] bg-[#244b35] p-6 text-[#f5f3e9]">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full border border-white/10"/><div className="absolute -right-5 -top-5 h-28 w-28 rounded-full border border-white/10"/>
          <p className="relative text-[10px] font-bold uppercase tracking-[.2em] text-[#c9d9c7]">Estatehold · Secure review</p>
          <h2 className="relative mt-5 font-display text-2xl font-extrabold leading-tight">Your details stay in the right hands.</h2>
          <div className="relative mt-7 space-y-5">
            {[["01", "Your information", "Complete the identity and contact details."], ["02", "Private upload", "Documents are securely stored for reviewers."], ["03", "Team review", "We’ll assess your application and update its status."]].map(([step, title, detail]) => <div key={step} className="flex gap-3"><span className="font-mono text-xs text-[#d3b77e]">{step}</span><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-[#c2d0c1]">{detail}</p></div></div>)}
          </div>
          <div className="relative mt-8 flex gap-3 border-t border-white/15 pt-5 text-xs leading-5 text-[#c9d6c8]"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-[#d3b77e]"/>Private documents are accessible only to authorized reviewers.</div>
        </div>
      </aside>
    </div>
  </main>;
}

import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Check, HardHat, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { constructionTabUrl, getConstructionTab, type ConstructionTab } from './construction-tabs';

const designs = [
  { title: 'Compact Family Bungalow', type: 'Bungalow', storeys: 1, bedrooms: 3, price: '₦28m–₦42m', image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80' },
  { title: 'Contemporary Duplex', type: 'Duplex', storeys: 2, bedrooms: 4, price: '₦68m–₦95m', image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80' },
  { title: 'Urban Storey Residence', type: 'Storey Building', storeys: 3, bedrooms: 6, price: '₦110m–₦160m', image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=80' },
  { title: 'Neighbourhood Commercial Block', type: 'Commercial', storeys: 2, bedrooms: 0, price: '₦90m–₦140m', image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1000&q=80' },
];
const projects = [
  { title: 'Emene family duplex', place: 'Emene, Enugu', progress: 62, stage: 'Roofing', completion: 'Aug 2027', contractor: 'Estatehold Build Team', image: designs[1].image },
  { title: 'Independence Layout bungalow', place: 'Enugu North, Enugu', progress: 28, stage: 'Foundation', completion: 'Nov 2027', contractor: 'Cedarline Construction', image: designs[0].image },
  { title: 'Ikeja commercial suites', place: 'Ikeja, Lagos', progress: 88, stage: 'Finishing', completion: 'Jun 2027', contractor: 'Northstar Works', image: designs[3].image },
];

export default function ConstructionPage() {
  const [tab, setTab] = useState<ConstructionTab>(() => getConstructionTab(window.location.search));
  const [filter, setFilter] = useState('All');
  const [confirmation, setConfirmation] = useState('');
  const [compare, setCompare] = useState(50);
  const [selectedPlan, setSelectedPlan] = useState<(typeof designs)[number] | null>(null);
  useEffect(() => {
    const sync = () => setTab(getConstructionTab(window.location.search));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const chooseTab = (next: ConstructionTab) => {
    window.history.pushState({}, '', constructionTabUrl(next));
    setTab(next);
  };
  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const requests = JSON.parse(localStorage.getItem('estatehold-construction-requests') || '[]') as object[];
    requests.push({
      id: crypto.randomUUID(), fullName: fd.get('fullName'), phone: fd.get('phone'),
      landLocation: fd.get('landLocation'), landSize: fd.get('landSize'), budget: fd.get('budget'),
      projectType: fd.get('projectType'), description: fd.get('description'),
      preferredVisitDate: fd.get('preferredVisitDate'), documentName: (fd.get('landDocuments') as File)?.name || null,
      status: 'pending', createdAt: new Date().toISOString(),
    });
    localStorage.setItem('estatehold-construction-requests', JSON.stringify(requests));
    event.currentTarget.reset();
    setConfirmation('Request received — our engineer will call you within 24hrs');
  };
  const filteredDesigns = filter === 'All' ? designs : designs.filter(design => design.type === filter);
  const labels: [ConstructionTab, string][] = [['plans','Building Plan & Design Samples'],['ongoing','Ongoing Projects'],['completed','Completed Projects'],['request','Request Project']];

  return <main className="space-y-6">
    <header className="rounded-3xl bg-[#14291c] p-7 text-white sm:p-10"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9ccda3]">Estatehold construction</p><h1 className="mt-3 font-display text-3xl font-extrabold sm:text-5xl">Build with a clear plan.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#d0ddd1]">Explore designs, follow active sites, review completed work or request a project consultation.</p></header>
    <nav className="flex gap-2 overflow-x-auto border-b border-[#e3e9e2]" role="tablist" aria-label="Construction sections">{labels.map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>chooseTab(key)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-bold ${tab===key?'border-[#16843d] text-[#176d35]':'border-transparent text-[#68776d]'}`}>{label}</button>)}</nav>
    {tab==='plans' && <section className="space-y-4"><div className="flex flex-wrap gap-2">{['All','Bungalow','Duplex','Storey Building','Commercial'].map(type=><button key={type} onClick={()=>setFilter(type)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter===type?'bg-[#173b24] text-white':'border border-[#dfe7df] bg-white text-[#53665a]'}`}>{type}</button>)}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{filteredDesigns.map(plan=><article key={plan.title} className="overflow-hidden rounded-2xl border border-[#e4eae3] bg-white"><img src={plan.image} alt={plan.title} className="h-44 w-full object-cover"/><div className="p-4"><span className="text-xs font-bold text-[#26723a]">{plan.type}</span><h2 className="mt-1 font-display text-lg font-extrabold">{plan.title}</h2><p className="mt-2 text-sm text-[#718077]">{plan.storeys} storey{plan.storeys===1?'':'s'} · {plan.bedrooms||'Flexible'} bedrooms</p><p className="mt-3 font-bold">{plan.price}</p><button onClick={()=>setSelectedPlan(plan)} className="mt-4 w-full rounded-xl bg-[#173b24] py-2.5 text-sm font-bold text-white">View Plan</button></div></article>)}</div></section>}
    {tab==='ongoing' && <section className="grid gap-4 md:grid-cols-2">{projects.map(project=><article key={project.title} className="overflow-hidden rounded-2xl border border-[#e4eae3] bg-white"><img src={project.image} alt={`${project.title} site`} className="h-56 w-full object-cover"/><div className="space-y-3 p-5"><h2 className="font-display text-xl font-extrabold">{project.title}</h2><p className="text-sm text-[#718077]"><MapPin size={14} className="mr-1 inline"/>{project.place}</p><div className="flex justify-between text-xs font-bold"><span>{project.stage}</span><span>{project.progress}%</span></div><progress className="h-2 w-full accent-[#16843d]" max={100} value={project.progress}/><p className="text-xs text-[#718077]">Est. completion {project.completion} · {project.contractor}</p></div></article>)}</section>}
    {tab==='completed' && <section className="grid gap-5 lg:grid-cols-2"><article className="rounded-2xl border border-[#e4eae3] bg-white p-5"><span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] px-3 py-1 text-xs font-bold text-[#26723a]"><ShieldCheck size={14}/>Verified Build by Estatehold</span><h2 className="mt-3 font-display text-xl font-extrabold">Emene family home · 2025</h2><div className="relative mt-4 h-64 overflow-hidden rounded-xl"><img src={designs[1].image} alt="After construction" className="h-full w-full object-cover"/><div className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white" style={{width:`${compare}%`}}><img src={designs[0].image} alt="Before construction" className="h-full w-[calc(100vw-3rem)] max-w-none object-cover lg:w-[38rem]"/></div><input aria-label="Before and after comparison" type="range" min="0" max="100" value={compare} onChange={e=>setCompare(Number(e.target.value))} className="absolute inset-x-4 bottom-3 w-[calc(100%-2rem)] accent-white"/></div><p className="mt-3 text-sm text-[#718077]">Enugu · Completed 2025 · Cost range ₦45m–₦60m</p><blockquote className="mt-3 border-l-2 border-[#16843d] pl-3 text-sm italic">“The team kept us informed at every stage and delivered a home our family is proud of.”</blockquote></article></section>}
    {tab==='request' && <form onSubmit={submitRequest} className="grid gap-4 rounded-3xl border border-[#e4eae3] bg-white p-5 sm:grid-cols-2 sm:p-8"><h2 className="font-display text-2xl font-extrabold sm:col-span-2">Tell us about your project</h2><label className="text-sm font-semibold">Full Name<input name="fullName" required className="mt-1 block w-full rounded-xl border p-3"/></label><label className="text-sm font-semibold">Phone<input name="phone" required type="tel" className="mt-1 block w-full rounded-xl border p-3"/></label><label className="text-sm font-semibold">Location of Land<input name="landLocation" required className="mt-1 block w-full rounded-xl border p-3"/></label><label className="text-sm font-semibold">Land Size<input name="landSize" required placeholder="e.g. 50 × 100 ft" className="mt-1 block w-full rounded-xl border p-3"/></label><label className="text-sm font-semibold">Budget Range<input name="budget" required placeholder="₦" className="mt-1 block w-full rounded-xl border p-3"/></label><label className="text-sm font-semibold">Project Type<select name="projectType" className="mt-1 block w-full rounded-xl border p-3">{designs.map(d=><option key={d.title}>{d.title}</option>)}<option>Custom</option></select></label><label className="text-sm font-semibold">Land documents (optional)<input name="landDocuments" type="file" accept=".pdf,.jpg,.jpeg,.png" className="mt-1 block w-full rounded-xl border p-2"/></label><label className="text-sm font-semibold">Preferred Site Visit Date<input name="preferredVisitDate" type="date" className="mt-1 block w-full rounded-xl border p-3"/></label><label className="text-sm font-semibold sm:col-span-2">Description<textarea name="description" rows={4} className="mt-1 block w-full rounded-xl border p-3"/></label><button className="rounded-xl bg-[#173b24] px-5 py-3 text-sm font-bold text-white sm:col-span-2">Submit project request</button>{confirmation && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-900 sm:col-span-2"><Check size={16} className="mr-1 inline"/>{confirmation}</p>}<p className="text-xs text-[#718077] sm:col-span-2"><HardHat size={14} className="mr-1 inline"/>Requests are stored in this browser's demo queue. Documents are not uploaded.</p></form>}
    {selectedPlan && <div role="dialog" aria-modal="true" aria-label={`${selectedPlan.title} plan`} className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={()=>setSelectedPlan(null)}><article className="w-full max-w-xl overflow-hidden rounded-2xl bg-white" onClick={event=>event.stopPropagation()}><img src={selectedPlan.image} alt="" className="h-64 w-full object-cover"/><div className="p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#26723a]">{selectedPlan.type}</p><h2 className="mt-1 font-display text-2xl font-extrabold">{selectedPlan.title}</h2><p className="mt-2 text-sm text-[#718077]">{selectedPlan.storeys} storeys · {selectedPlan.bedrooms || 'Flexible'} bedrooms · Indicative build range {selectedPlan.price}</p><button onClick={()=>setSelectedPlan(null)} className="mt-5 rounded-xl bg-[#173b24] px-4 py-2 text-sm font-bold text-white">Close plan details</button></div></article></div>}
    <p className="text-xs text-[#718077]"><Ruler size={13} className="mr-1 inline"/>Project pricing and progress shown are indicative sample data. <Link href="/" className="font-bold underline">Back to marketplace</Link> <Building2 size={13} className="ml-1 inline"/></p>
  </main>;
}

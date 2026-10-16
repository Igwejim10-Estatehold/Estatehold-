import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

type ConstructionRequest = {
  id: string; fullName: string; phone: string; landLocation: string; landSize: string;
  budget: string; projectType: string; description?: string; preferredVisitDate?: string;
  documentPath?: string; status: string; createdAt: string;
};

export default function ConstructionAdminQueue({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<ConstructionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/construction-requests', { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || 'Construction queue could not be loaded.');
      setItems(body.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Construction queue could not be loaded.');
    } finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const download = async (item: ConstructionRequest) => {
    setDownloading(item.id); setError('');
    try {
      const response = await fetch(`/api/admin/construction-requests/${encodeURIComponent(item.id)}/document`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error('Private document could not be downloaded.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `land-document-${item.id}`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Private document could not be downloaded.'); }
    finally { setDownloading(''); }
  };
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-extrabold">Construction project requests</h2><p className="mt-1 text-sm text-[#718077]">Private queue · visible to administrators only</p></div><button onClick={()=>void load()} disabled={loading} aria-label="Refresh construction requests" className="rounded-lg border p-2"><RefreshCw size={16}/></button></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {loading ? <p className="py-6 text-sm text-[#718077]">Loading requests…</p> : items.length ? items.map(item=><article key={item.id} className="rounded-2xl border border-[#e4eae3] p-4"><div className="flex flex-wrap justify-between gap-3"><div><span className="text-xs font-bold uppercase text-[#26723a]">{item.status.replaceAll('_',' ')}</span><h3 className="mt-1 font-bold">{item.fullName} · {item.phone}</h3><p className="mt-1 text-sm text-[#718077]">{item.projectType} · {item.landLocation} · {item.landSize}</p><p className="text-sm text-[#718077]">Budget: {item.budget}{item.preferredVisitDate ? ` · Site visit: ${item.preferredVisitDate}` : ''}</p>{item.description && <p className="mt-2 text-sm">{item.description}</p>}</div><p className="text-xs text-[#718077]">{new Date(item.createdAt).toLocaleString()}</p></div>{item.documentPath && <button onClick={()=>void download(item)} disabled={downloading===item.id} className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"><Download size={14}/>{downloading===item.id?'Downloading…':'Download private land document'}</button>}</article>) : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-[#718077]">No construction requests yet.</p>}
  </section>;
}

import { useEffect, useState } from 'react';
import Toast, { ToastStack } from './Toast';
import { useConfirm } from './useConfirm';
import { badgeClass, buttonClass, cardClass, formControlClass, modalOverlayClass, modalPanelClass } from '../ui/shared/classes';

interface Testimonial {
	id: string;
	name: string;
	location: string | null;
	work: string | null;
	story: string;
	rating: number;
	visible: number;
	sort_order: number;
}

interface Draft {
	name: string;
	location: string;
	work: string;
	story: string;
	rating: number;
	visible: boolean;
	sortOrder: number;
}

const EMPTY_DRAFT: Draft = { name: '', location: '', work: '', story: '', rating: 5, visible: true, sortOrder: 0 };

export default function Testimonials() {
	const [items, setItems] = useState<Testimonial[] | null>(null);
	const [works, setWorks] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
	const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
	const { confirm, confirmDialog } = useConfirm();

	// The "work" a story is about: pick from the publications and imported books.
	useEffect(() => {
		let cancelled = false;
		Promise.all([
			fetch('/api/admin/posts/meta', { credentials: 'same-origin' }).then((r) => (r.ok ? (r.json() as Promise<{ data: { publications: Array<{ name: string }> } }>) : null)),
			fetch('/api/admin/books', { credentials: 'same-origin' }).then((r) => (r.ok ? (r.json() as Promise<{ data: { books: Array<{ title: string }> } }>) : null)),
		])
			.then(([meta, books]) => {
				if (cancelled) return;
				const names = [...(meta?.data.publications.map((p) => p.name) ?? []), ...(books?.data.books.map((b) => b.title) ?? [])];
				setWorks([...new Set(names)].sort((a, b) => a.localeCompare(b)));
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	const load = () => {
		fetch('/api/admin/testimonials', { credentials: 'same-origin' })
			.then((response) => {
				if (response.status === 401) {
					window.location.href = '/admin/login';
					return null;
				}
				if (!response.ok) throw new Error(`Failed to load testimonials (HTTP ${response.status}).`);
				return response.json() as Promise<{ data: { testimonials: Testimonial[] } }>;
			})
			.then((body) => {
				if (body) setItems(body.data.testimonials);
			})
			.catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Failed to load testimonials.'));
	};

	useEffect(() => {
		load();
	}, []);

	async function save(draft: Draft, id: string | null) {
		if (!draft.name.trim() || !draft.story.trim()) {
			setToast({ tone: 'error', message: 'Name and story are required.' });
			return;
		}
		const response = await fetch(id ? `/api/admin/testimonials/${id}` : '/api/admin/testimonials', {
			method: id ? 'PUT' : 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: draft.name.trim(),
				location: draft.location.trim(),
				work: draft.work.trim(),
				story: draft.story.trim(),
				rating: draft.rating,
				visible: draft.visible,
				sortOrder: draft.sortOrder,
			}),
		});
		if (!response.ok) {
			setToast({ tone: 'error', message: 'Could not save the testimonial.' });
			return;
		}
		setEditing(null);
		setToast({ tone: 'success', message: id ? 'Testimonial updated.' : 'Testimonial added.' });
		load();
	}

	async function remove(item: Testimonial) {
		const confirmed = await confirm({ title: 'Delete testimonial?', message: `Remove the testimonial from ${item.name}? This cannot be undone.`, confirmLabel: 'Delete', tone: 'danger' });
		if (!confirmed) return;
		const response = await fetch(`/api/admin/testimonials/${item.id}`, { method: 'DELETE', credentials: 'same-origin' });
		if (!response.ok) {
			setToast({ tone: 'error', message: 'Could not delete the testimonial.' });
			return;
		}
		setToast({ tone: 'success', message: 'Testimonial deleted.' });
		load();
	}

	if (error) {
		return <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-foreground">{error}</p>;
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">Stories arrive by email via the contact form; add them here to show them on the homepage.</p>
				<button type="button" onClick={() => setEditing({ id: null, draft: { ...EMPTY_DRAFT } })} className={`${buttonClass('primary', 'sm')} shrink-0`}>
					New testimonial
				</button>
			</div>

			{!items ? (
				<div className="h-32 animate-pulse rounded-lg bg-surface-elevated" />
			) : items.length === 0 ? (
				<div className={cardClass()}>
					<p className="px-5 py-10 text-center text-sm text-muted-foreground">No testimonials yet. Add one from a reader email to show it on the homepage.</p>
				</div>
			) : (
				<ul className="space-y-3">
					{items.map((item) => (
						<li key={item.id} className={`${cardClass()} p-4`}>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
										{item.name}
										<span className="text-xs font-normal text-yellow-500" aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}</span>
										{!item.visible && <span className={badgeClass('muted')}>Hidden</span>}
										{item.work && <span className={badgeClass('soft')}>{item.work}</span>}
									</p>
									{item.location && <p className="mt-0.5 text-xs text-muted-foreground">{item.location}</p>}
									<p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.story}</p>
								</div>
								<div className="flex shrink-0 gap-2">
									<button
										type="button"
										onClick={() =>
											setEditing({
												id: item.id,
												draft: { name: item.name, location: item.location ?? '', work: item.work ?? '', story: item.story, rating: item.rating, visible: item.visible === 1, sortOrder: item.sort_order },
											})
										}
										className={buttonClass('outline', 'sm')}
									>
										Edit
									</button>
									<button type="button" onClick={() => void remove(item)} className={buttonClass('dangerOutline', 'sm')}>
										Delete
									</button>
								</div>
							</div>
						</li>
					))}
				</ul>
			)}

			{editing && <TestimonialModal initial={editing.draft} isNew={editing.id === null} works={works} onClose={() => setEditing(null)} onSave={(draft) => void save(draft, editing.id)} />}
			{confirmDialog}
			<ToastStack>{toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}</ToastStack>
		</div>
	);
}

function TestimonialModal({ initial, isNew, works, onClose, onSave }: { initial: Draft; isNew: boolean; works: string[]; onClose: () => void; onSave: (draft: Draft) => void }) {
	const [draft, setDraft] = useState<Draft>(initial);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose();
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

	return (
		<div
			className={modalOverlayClass}
			role="dialog"
			aria-modal="true"
			aria-labelledby="testimonial-title"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className={modalPanelClass('w-full max-w-lg max-h-[90vh] overflow-y-auto p-5')}>
				<h3 id="testimonial-title" className="mb-4 text-base font-semibold text-foreground">
					{isNew ? 'New testimonial' : 'Edit testimonial'}
				</h3>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						onSave(draft);
					}}
				>
					<label className="block text-sm">
						<span className="font-medium text-foreground">Name</span>
						<input type="text" value={draft.name} onChange={(event) => set('name', event.target.value)} required className={formControlClass} />
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block text-sm">
							<span className="font-medium text-foreground">Location</span>
							<input type="text" value={draft.location} onChange={(event) => set('location', event.target.value)} className={formControlClass} />
						</label>
						<label className="block text-sm">
							<span className="font-medium text-foreground">Work</span>
							<select value={draft.work} onChange={(event) => set('work', event.target.value)} className={formControlClass}>
								<option value="">None</option>
								{draft.work && !works.includes(draft.work) && <option value={draft.work}>{draft.work}</option>}
								{works.map((work) => (
									<option key={work} value={work}>
										{work}
									</option>
								))}
							</select>
						</label>
					</div>
					<label className="block text-sm">
						<span className="font-medium text-foreground">Story</span>
						<textarea value={draft.story} onChange={(event) => set('story', event.target.value)} required rows={5} className={`${formControlClass} resize-none`} />
					</label>
					<div className="flex flex-wrap items-center gap-6">
						<label className="flex items-center gap-2 text-sm text-foreground">
							Rating
							<select value={draft.rating} onChange={(event) => set('rating', Number(event.target.value))} className={`${formControlClass} w-20`}>
								{[5, 4, 3, 2, 1].map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center gap-2 text-sm text-foreground">
							Order
							<input type="number" min={0} value={draft.sortOrder} onChange={(event) => set('sortOrder', Number(event.target.value) || 0)} className={`${formControlClass} w-20`} />
						</label>
						<label className="flex items-center gap-2 text-sm text-foreground">
							<input type="checkbox" checked={draft.visible} onChange={(event) => set('visible', event.target.checked)} className="rounded border-border text-accent focus:ring-accent" />
							Show on homepage
						</label>
					</div>
					<div className="flex items-center justify-end gap-2 border-t border-border pt-4">
						<button type="button" onClick={onClose} className={buttonClass('outline')}>
							Cancel
						</button>
						<button type="submit" className={buttonClass('primary')}>
							{isNew ? 'Add' : 'Save'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

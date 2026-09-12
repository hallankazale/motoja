import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowRight, LoaderCircle, X, ShieldCheck } from 'lucide-react';

export function Button({ children, busy = false, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return <button {...props} disabled={props.disabled || busy} className={`button ${variant} ${props.className || ''}`} aria-busy={busy}>{busy ? <LoaderCircle size={20} className="spin" /> : null}{children}</button>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const dialog = ref.current; return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose}><div className="modal-top"><h2>{title}</h2><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={22} /></button></div>{children}</dialog>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <p className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>; }
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><div className="empty-icon"><ShieldCheck size={28} /></div><h3>{title}</h3><p>{children}</p></div>; }
export function RowLink({ title, detail, icon, onClick }: { title: string; detail?: string; icon: ReactNode; onClick: () => void }) {
  return <button className="row-link" onClick={onClick}><span className="row-icon">{icon}</span><span><strong>{title}</strong>{detail ? <small>{detail}</small> : null}</span><ArrowRight size={18} /></button>;
}

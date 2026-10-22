import { useEffect, useState } from 'react';
import type { Claim } from '@laf/shared';
import { Modal } from './ui';

/**
 * Confirmación para aprobar o rechazar una reclamación. Al rechazar se puede
 * escribir un motivo (se envía como `reviewNote` y el reclamante lo ve); antes
 * se rechazaba con un clic, sin confirmación ni explicación (auditoría UX-02).
 */
export function ClaimReviewDialog({
  claim,
  decision,
  onConfirm,
  onCancel,
}: {
  claim: Claim | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  onConfirm: (note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const open = !!claim && !!decision;

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await onConfirm(note.trim());
    } finally {
      setBusy(false);
    }
  }

  const approve = decision === 'APPROVED';
  return (
    <Modal open={open} label={approve ? 'Aprobar reclamación' : 'Rechazar reclamación'} onClose={busy ? () => undefined : onCancel}>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
        {approve ? 'Aprobar reclamación' : 'Rechazar reclamación'}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {approve
          ? `Confirmas que «${claim?.foundItem?.title ?? 'el objeto'}» es de ${claim?.claimant.name || 'esta persona'}. Las demás solicitudes pendientes de este objeto se rechazarán automáticamente y se les avisará.`
          : `${claim?.claimant.name || 'El reclamante'} recibirá un aviso. Puedes explicarle el motivo.`}
      </p>
      {!approve && (
        <div className="mt-4">
          <label className="label" htmlFor="review-note">
            Motivo (opcional)
          </label>
          <textarea
            id="review-note"
            className="input min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="Ej. La descripción no coincide con el objeto."
          />
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className={approve ? 'btn-primary' : 'btn-danger'} onClick={() => void submit()} disabled={busy}>
          {busy ? 'Guardando…' : approve ? 'Aprobar' : 'Rechazar'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Custom confirmation modal — replaces browser's default window.confirm()
 * Usage: <ConfirmModal ... />
 */
export default function ConfirmModal({ title, message, subMessage, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmType = 'danger', onConfirm, onCancel }) {
  const btnClass = {
    danger:  'btn btn-danger',
    primary: 'btn btn-primary',
    success: 'btn btn-success',
    warning: 'btn bg-amber-500 text-white hover:bg-amber-600',
  }[confirmType] || 'btn btn-primary'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="card w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-2xl mb-2">
            {confirmType === 'danger' ? '⚠️' : confirmType === 'success' ? '✅' : 'ℹ️'}
          </div>
          <h3 className="text-base font-semibold mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{message}</p>
          {subMessage && <p className="text-xs text-gray-400 mt-1">{subMessage}</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1 justify-center" onClick={onCancel}>{cancelLabel}</button>
          <button className={`${btnClass} flex-1 justify-center`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
